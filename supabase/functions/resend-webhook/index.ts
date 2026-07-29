// Edge Function: resend-webhook
//
// Endpoint público chamado pelo Resend (não pelo navegador) sempre que um
// e-mail muda de status (entregue, aberto, clicado, rejeitado...).
// Registrado no painel do Resend como webhook desta campanha.
//
// Não há checagem de is_admin() aqui — quem chama é o Resend, não um admin
// logado. A segurança vem da assinatura Svix: sem validar isso, qualquer
// um poderia forjar um POST dizendo "este e-mail foi aberto" e inflar o
// relatório de campanhas.
//
// Deploy:
//   supabase functions deploy resend-webhook --no-verify-jwt
//   supabase secrets set RESEND_WEBHOOK_SECRET=<signing secret do webhook>
//
// --no-verify-jwt é necessário porque o Resend não manda um JWT do Supabase
// no header Authorization — a autenticação deste endpoint é a assinatura
// Svix, verificada manualmente abaixo.
//
// (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já existem automaticamente
// dentro do ambiente de toda Edge Function do Supabase.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import { decodeBase64, encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const RESEND_WEBHOOK_SECRET = Deno.env.get("RESEND_WEBHOOK_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Tipos de evento aceitos pelo check da coluna eventos_email.tipo
// (sql/021_campanhas_marketing.sql) — qualquer coisa fora disso é ignorada.
const TIPOS_VALIDOS = new Set(["sent", "delivered", "opened", "clicked", "bounced", "complained"]);

// Valida a assinatura Svix do payload (protocolo usado pelo Resend para
// webhooks: https://resend.com/docs/dashboard/webhooks/verify-webhooks-requests).
// O secret vem no formato "whsec_<base64>"; a assinatura esperada é
// HMAC-SHA256(secret, "<svix-id>.<svix-timestamp>.<corpo bruto>"), em base64.
async function assinaturaValida(corpoBruto: string, svixId: string, svixTimestamp: string, svixSignature: string): Promise<boolean> {
    const secretBase64 = RESEND_WEBHOOK_SECRET.startsWith("whsec_")
        ? RESEND_WEBHOOK_SECRET.slice("whsec_".length)
        : RESEND_WEBHOOK_SECRET;
    const secretBytes = decodeBase64(secretBase64);

    const key = await crypto.subtle.importKey(
        "raw",
        secretBytes,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );

    const conteudoAssinado = `${svixId}.${svixTimestamp}.${corpoBruto}`;
    const assinaturaCalculada = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(conteudoAssinado));
    const assinaturaEsperada = encodeBase64(new Uint8Array(assinaturaCalculada));

    // O header svix-signature pode trazer mais de uma versão de assinatura,
    // separadas por espaço, cada uma no formato "v1,<base64>".
    return svixSignature
        .split(" ")
        .map((par) => par.split(",")[1])
        .some((assinatura) => assinatura === assinaturaEsperada);
}

Deno.serve(async (req) => {
    // Sempre responde 200 rapidamente, mesmo em erro de negócio interno —
    // só uma assinatura inválida (payload forjado) é rejeitada de verdade,
    // pra não fazer o Resend ficar reenviando o mesmo evento legítimo.
    try {
        const corpoBruto = await req.text();
        const svixId = req.headers.get("svix-id");
        const svixTimestamp = req.headers.get("svix-timestamp");
        const svixSignature = req.headers.get("svix-signature");

        if (!svixId || !svixTimestamp || !svixSignature) {
            return new Response(JSON.stringify({ error: "Headers de assinatura ausentes." }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        const valida = await assinaturaValida(corpoBruto, svixId, svixTimestamp, svixSignature);
        if (!valida) {
            return new Response(JSON.stringify({ error: "Assinatura inválida." }), {
                status: 401,
                headers: { "Content-Type": "application/json" },
            });
        }

        const payload = JSON.parse(corpoBruto);
        const tipoEvento: string | undefined = payload?.type;
        const resendEmailId: string | undefined = payload?.data?.email_id;

        if (!tipoEvento || !resendEmailId) {
            return new Response(JSON.stringify({ success: true }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        }

        const tipo = tipoEvento.replace(/^email\./, "");
        if (!TIPOS_VALIDOS.has(tipo)) {
            return new Response(JSON.stringify({ success: true }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        }

        const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

        // Encontra a linha "sent" original (gravada por disparar-campanha)
        // pra descobrir de qual campanha/destinatário este evento é. Se não
        // achar, é um e-mail enviado fora deste fluxo — ignora silenciosamente,
        // sem derrubar o webhook.
        const { data: eventoOriginal } = await supabaseAdmin
            .from("eventos_email")
            .select("campanha_id, destinatario_user_id")
            .eq("resend_email_id", resendEmailId)
            .limit(1)
            .maybeSingle();

        if (!eventoOriginal) {
            return new Response(JSON.stringify({ success: true }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        }

        // Evita duplicar o mesmo evento em caso de reenvio do Resend
        // (retry por timeout, por exemplo) — sem isso o relatório contaria
        // "aberto" duas vezes para o mesmo e-mail.
        const { data: jaRegistrado } = await supabaseAdmin
            .from("eventos_email")
            .select("id")
            .eq("resend_email_id", resendEmailId)
            .eq("tipo", tipo)
            .limit(1)
            .maybeSingle();

        if (!jaRegistrado) {
            await supabaseAdmin.from("eventos_email").insert({
                campanha_id: eventoOriginal.campanha_id,
                resend_email_id: resendEmailId,
                destinatario_user_id: eventoOriginal.destinatario_user_id,
                tipo,
            });
        }

        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (err) {
        // Erro interno também responde 200 — evita reenvio infinito do
        // Resend por um evento que já é irrecuperável deste lado.
        console.error("Erro ao processar webhook do Resend:", err);
        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    }
});
