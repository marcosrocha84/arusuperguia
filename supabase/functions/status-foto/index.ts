// Edge Function: status-foto
//
// Recebe { codigo } — o id (uuid) da foto, usado como código de
// acompanhamento — e devolve só o status público dela: "pendente",
// "aprovada" (com a url_thumb) ou "reprovada". Se o código não existir ou
// não for um uuid válido, devolve "nao_encontrado".
//
// Por que uma Edge Function em vez de consulta direta do navegador: a RLS
// pública hoje só libera leitura de fotos com aprovada=true (ver
// sql/015_fotos_concurso_rls.sql) — de propósito, pra ninguém conseguir
// listar/raspar nome e foto de todo mundo que ainda está com o envio em
// análise. Afrouxar isso pra cobrir "pendente"/"reprovada" também abriria
// exatamente essa brecha. Rodando aqui, com a Service Role Key, a consulta
// é sempre por um único id exato (não dá pra listar todas as fotos por essa
// rota) e só devolve o mínimo necessário pra tela de status.
//
// Deploy:
//   supabase functions deploy status-foto
//
// (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já existem automaticamente
// dentro do ambiente de toda Edge Function do Supabase.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Mesmo padrão de CORS de enviar-foto — ver comentário lá pra detalhes de
// por que localhost/127.0.0.1:5500 (Live Server) também estão liberados.
const ORIGENS_PERMITIDAS = [
    "https://arusuperguia.com.br",
    "http://127.0.0.1:5500",
    "http://localhost:5500",
];

function construirCorsHeaders(origin: string | null) {
    return {
        "Access-Control-Allow-Origin": origin && ORIGENS_PERMITIDAS.includes(origin) ? origin : ORIGENS_PERMITIDAS[0],
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Vary": "Origin",
    };
}

// O código é o próprio id (uuid) da foto — valida o formato antes de
// consultar o banco, pra devolver "não encontrado" rápido em códigos
// digitados errado, sem depender do Postgres rejeitar um uuid malformado.
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
    const CORS_HEADERS = construirCorsHeaders(req.headers.get("origin"));

    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: CORS_HEADERS });
    }

    try {
        const { codigo } = await req.json();
        const codigoLimpo = typeof codigo === "string" ? codigo.trim().toLowerCase() : "";

        if (!REGEX_UUID.test(codigoLimpo)) {
            return new Response(JSON.stringify({ status: "nao_encontrado" }), {
                status: 200,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            });
        }

        const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

        const { data: foto, error } = await supabaseAdmin
            .from("fotos_concurso")
            .select("aprovada, reprovada, url_thumb")
            .eq("id", codigoLimpo)
            .maybeSingle();

        if (error) {
            return new Response(JSON.stringify({ error: error.message }), {
                status: 500,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            });
        }

        if (!foto) {
            return new Response(JSON.stringify({ status: "nao_encontrado" }), {
                status: 200,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            });
        }

        if (foto.aprovada) {
            return new Response(JSON.stringify({ status: "aprovada", url_thumb: foto.url_thumb }), {
                status: 200,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            });
        }

        if (foto.reprovada) {
            return new Response(JSON.stringify({ status: "reprovada" }), {
                status: 200,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            });
        }

        return new Response(JSON.stringify({ status: "pendente" }), {
            status: 200,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: String(err) }), {
            status: 500,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
    }
});
