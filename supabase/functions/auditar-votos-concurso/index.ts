// Edge Function: auditar-votos-concurso
//
// Chamada interativamente por um admin logado em curadoria.html (não por
// cron) — recebe { concurso_id } e devolve, por foto, sinais de possível
// fraude na votação:
//
//   - percentual_foto_unica: % dos votantes da foto que só votaram NELA e
//     em nenhuma outra foto do mesmo concurso. Um votante orgânico costuma
//     navegar e votar em várias fotos; um bloco grande de "votante de foto
//     única" é um sinal forte.
//   - maior_cluster_criacao: maior grupo de votantes cujo primeiro login no
//     Órbita (auth.users.created_at) caiu dentro de uma janela de 7 dias
//     entre si — não é a data de criação da conta Google (o Google não
//     expõe isso em nenhuma API pública), mas várias pessoas aparecendo
//     pela primeira vez no site perto da votação já é, por si só, um
//     padrão digno de atenção.
//   - maior_rajada_votos: maior grupo de votos NESSA foto que caiu dentro
//     de uma janela de 10 minutos entre si (votos_realizados.criado_em,
//     adicionado em sql/030_votos_realizados_criado_em.sql). Rajadas — um
//     bloco de votos concentrado em poucos minutos — é o sinal mais direto
//     de campanha coordenada/compra de votos. Votos registrados ANTES dessa
//     migration não têm hora real (todos receberam `now()` no momento em
//     que o script rodou), então uma rajada aparente restrita a esse
//     instante específico é ruído da migração, não fraude — vale conferir
//     a data antes de desconfiar.
//   - conta_mais_nova_dias: dias desde o 1º login no Órbita do votante mais
//     recente da foto.
//
// Deploy:
//   supabase functions deploy auditar-votos-concurso
//
// (SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY já existem
// automaticamente no ambiente de toda Edge Function do Supabase.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Mesmo padrão de CORS de disparar-campanha/enviar-resultado-concurso.
const ORIGENS_PERMITIDAS = [
    "https://arusuperguia.com.br",
    "https://orbita.art.br",
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

const JANELA_CLUSTER_CRIACAO_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias
const JANELA_RAJADA_VOTOS_MS = 10 * 60 * 1000; // 10 minutos

// Instante em que sql/030_votos_realizados_criado_em.sql rodou (30/09/2026,
// 10:46:40, horário de Brasília) — todo voto registrado ANTES da migration
// herdou esse exato `now()` como criado_em, então eles formam uma "rajada"
// falsa que não reflete nenhum voto real acontecendo de verdade. Ignorado
// na detecção de rajada (com folga de alguns segundos por segurança), sem
// afetar total_votantes nem os outros sinais.
const MOMENTO_MIGRACAO_MS = Date.parse("2026-09-30T13:46:40Z"); // 10:46:40 -03:00
const TOLERANCIA_MOMENTO_MIGRACAO_MS = 5000;

// Dado um array de datas, acha o maior subconjunto onde a diferença entre a
// mais antiga e a mais nova cabe dentro de "janelaMs" — janela deslizante
// sobre as datas ordenadas. Reaproveitado tanto pro cluster de 1º login
// quanto pra rajada de votos, só muda a janela de tempo.
function maiorClusterDeDatas(datas: Date[], janelaMs: number): number {
    if (datas.length === 0) return 0;
    const ordenadas = [...datas].sort((a, b) => a.getTime() - b.getTime());
    let maior = 1;
    let inicio = 0;
    for (let fim = 0; fim < ordenadas.length; fim++) {
        while (ordenadas[fim].getTime() - ordenadas[inicio].getTime() > janelaMs) {
            inicio++;
        }
        maior = Math.max(maior, fim - inicio + 1);
    }
    return maior;
}

Deno.serve(async (req) => {
    const CORS_HEADERS = construirCorsHeaders(req.headers.get("origin"));

    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: CORS_HEADERS });
    }

    try {
        const { concurso_id } = await req.json();

        if (!concurso_id || typeof concurso_id !== "string") {
            return new Response(JSON.stringify({ error: "concurso_id é obrigatório." }), {
                status: 400,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            });
        }

        // 1) Confere is_admin() com o JWT de quem chamou — mesma checagem
        // de disparar-campanha/enviar-resultado-concurso.
        const authHeader = req.headers.get("authorization");
        if (!authHeader) {
            return new Response(JSON.stringify({ error: "Não autenticado." }), {
                status: 401,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            });
        }

        const supabaseComoChamador = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: authHeader } },
        });

        const { data: souAdmin, error: adminError } = await supabaseComoChamador.rpc("is_admin");

        if (adminError || !souAdmin) {
            return new Response(JSON.stringify({ error: "Apenas administradores podem auditar a votação." }), {
                status: 403,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            });
        }

        const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

        // 2) Fotos do concurso.
        const { data: fotos, error: fotosError } = await supabaseAdmin
            .from("fotos_concurso")
            .select("id, nome_participante, votos, aprovada, reprovada")
            .eq("concurso_id", concurso_id);

        if (fotosError) {
            return new Response(JSON.stringify({ error: fotosError.message }), {
                status: 500,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            });
        }

        const fotosDoConcurso = fotos ?? [];
        const fotoIds = fotosDoConcurso.map((f) => f.id);

        if (fotoIds.length === 0) {
            return new Response(JSON.stringify({ fotos: [] }), {
                status: 200,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            });
        }

        // 3) Todos os votos dessas fotos.
        const { data: votos, error: votosError } = await supabaseAdmin
            .from("votos_realizados")
            .select("user_id, foto_id, criado_em")
            .in("foto_id", fotoIds);

        if (votosError) {
            return new Response(JSON.stringify({ error: votosError.message }), {
                status: 500,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            });
        }

        const votosPorFoto = new Map<string, { user_id: string; criado_em: string }[]>();
        const fotosPorUsuario = new Map<string, Set<string>>();

        for (const voto of votos ?? []) {
            if (!votosPorFoto.has(voto.foto_id)) votosPorFoto.set(voto.foto_id, []);
            votosPorFoto.get(voto.foto_id)!.push({ user_id: voto.user_id, criado_em: voto.criado_em });

            if (!fotosPorUsuario.has(voto.user_id)) fotosPorUsuario.set(voto.user_id, new Set());
            fotosPorUsuario.get(voto.user_id)!.add(voto.foto_id);
        }

        // 4) Resolve e-mail + data de criação de cada votante distinto.
        // Sem listUsers() nesse projeto (nenhuma function usa) — mesmo
        // padrão de loop com getUserById já usado em disparar-campanha e
        // enviar-resultado-concurso. Aceitável pro volume atual; não
        // otimizar agora (ver plano).
        const idsUnicos = [...fotosPorUsuario.keys()];
        const dadosUsuario = new Map<string, { email: string | null; created_at: string | null }>();

        for (const userId of idsUnicos) {
            const { data: usuario, error: usuarioError } = await supabaseAdmin.auth.admin.getUserById(userId);
            if (!usuarioError && usuario?.user) {
                dadosUsuario.set(userId, {
                    email: usuario.user.email ?? null,
                    created_at: usuario.user.created_at ?? null,
                });
            } else {
                dadosUsuario.set(userId, { email: null, created_at: null });
            }
        }

        const agora = Date.now();

        // 5) Monta o resultado por foto.
        const resultado = fotosDoConcurso.map((foto) => {
            const votosDaFoto = votosPorFoto.get(foto.id) ?? [];
            const totalVotantes = votosDaFoto.length;

            const votantes = votosDaFoto.map(({ user_id: userId, criado_em: votoCriadoEm }) => {
                const dados = dadosUsuario.get(userId) ?? { email: null, created_at: null };
                const diasDeConta = dados.created_at
                    ? Math.floor((agora - new Date(dados.created_at).getTime()) / (24 * 60 * 60 * 1000))
                    : null;
                return {
                    user_id: userId,
                    email: dados.email,
                    created_at: dados.created_at,
                    dias_de_conta: diasDeConta,
                    votou_em: votoCriadoEm,
                    votou_so_nesta_foto: (fotosPorUsuario.get(userId)?.size ?? 0) === 1,
                };
            });

            const votantesFotoUnica = votantes.filter((v) => v.votou_so_nesta_foto).length;
            const percentualFotoUnica = totalVotantes > 0 ? votantesFotoUnica / totalVotantes : 0;

            const datasCriacao = votantes
                .map((v) => (v.created_at ? new Date(v.created_at) : null))
                .filter((d): d is Date => d !== null);
            const maiorCluster = maiorClusterDeDatas(datasCriacao, JANELA_CLUSTER_CRIACAO_MS);
            const percentualCluster = totalVotantes > 0 ? maiorCluster / totalVotantes : 0;

            const datasVoto = votantes
                .map((v) => (v.votou_em ? new Date(v.votou_em) : null))
                .filter((d): d is Date => d !== null)
                .filter((d) => Math.abs(d.getTime() - MOMENTO_MIGRACAO_MS) > TOLERANCIA_MOMENTO_MIGRACAO_MS);
            const maiorRajada = maiorClusterDeDatas(datasVoto, JANELA_RAJADA_VOTOS_MS);
            const percentualRajada = totalVotantes > 0 ? maiorRajada / totalVotantes : 0;

            const diasValidos = votantes.map((v) => v.dias_de_conta).filter((d): d is number => d !== null);
            const contaMaisNovaDias = diasValidos.length > 0 ? Math.min(...diasValidos) : null;

            return {
                foto_id: foto.id,
                nome_participante: foto.nome_participante,
                votos: foto.votos,
                aprovada: foto.aprovada,
                reprovada: foto.reprovada,
                total_votantes: totalVotantes,
                votantes_foto_unica: votantesFotoUnica,
                percentual_foto_unica: percentualFotoUnica,
                maior_cluster_criacao: maiorCluster,
                percentual_cluster_criacao: percentualCluster,
                maior_rajada_votos: maiorRajada,
                percentual_rajada_votos: percentualRajada,
                conta_mais_nova_dias: contaMaisNovaDias,
                votantes,
            };
        });

        // Mais suspeita primeiro.
        resultado.sort((a, b) => b.percentual_foto_unica - a.percentual_foto_unica);

        return new Response(JSON.stringify({ fotos: resultado }), {
            status: 200,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: String(err) }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
});
