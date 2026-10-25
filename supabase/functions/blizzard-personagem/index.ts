// Edge Function: blizzard-personagem
//
// Busca dados de um personagem de WoW Classic na API oficial da Blizzard
// (perfil, equipamento pra calcular iLvl médio, e mídia pro avatar) e
// devolve um objeto normalizado — usada pelo painel admin da Arena
// (curadoria.html > view Arena) ao alistar um combatente, e também pra
// ressincronizar os dados de todo mundo já inscrito num campeonato.
//
// Diferente das outras Edge Functions deste projeto, esta NÃO precisa da
// Service Role Key: ela só lê `arena_campeonatos` (RLS pública de leitura)
// e, no modo ressincronizar, grava em `arena_participantes` — e a policy
// de admin dessa tabela já permite isso pro próprio JWT do chamador. Não
// toca em auth.users nem em nada que exija bypass de RLS.
//
// Namespace da API da Blizzard: a Órbita.Arena NUNCA assume um valor fixo
// — cada campeonato tem seu próprio `namespace_blizzard` (coluna em
// arena_campeonatos, sql/033_arena.sql), porque a Blizzard mantém 3
// famílias de Classic em paralelo (confirmado na doc oficial, 2026-10):
//   - Classic Era (vanilla 1.x):        profile-classic1x-{regiao}
//   - Classic progression (hoje MoP):   profile-classic-{regiao}
//   - Burning Crusade Anniversary:      profile-classicann-{regiao}
// O namespace é passado tanto no header Battlenet-Namespace quanto na
// query string (redundante de propósito — documentado como aceitando os
// dois, manter os dois custa nada e evita depender de um comportamento
// não documentado de qual prevalece).
//
// Deploy:
//   supabase functions deploy blizzard-personagem
//   supabase secrets set BLIZZARD_CLIENT_ID=<client id do app Blizzard>
//   supabase secrets set BLIZZARD_CLIENT_SECRET=<client secret>
//
// (SUPABASE_URL e SUPABASE_ANON_KEY já existem automaticamente dentro do
// ambiente de toda Edge Function do Supabase.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const BLIZZARD_CLIENT_ID = Deno.env.get("BLIZZARD_CLIENT_ID")!;
const BLIZZARD_CLIENT_SECRET = Deno.env.get("BLIZZARD_CLIENT_SECRET")!;

// Mesmo padrão de CORS das outras functions deste projeto.
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

// ------------------------------------------------------------
// Token OAuth (client credentials) — reaproveitado entre chamadas
// enquanto a instância da Edge Function continuar "quente". Se a instância
// reciclar (comportamento normal de Edge Function, fora do nosso
// controle), simplesmente busca um token novo na próxima chamada.
// ------------------------------------------------------------
let tokenCache: { token: string; expiraEm: number } | null = null;

async function obterTokenBlizzard(regiao: string): Promise<string> {
    if (tokenCache && tokenCache.expiraEm > Date.now() + 30_000) {
        return tokenCache.token;
    }

    const credenciais = btoa(`${BLIZZARD_CLIENT_ID}:${BLIZZARD_CLIENT_SECRET}`);
    const resposta = await fetch(`https://${regiao}.battle.net/oauth/token`, {
        method: "POST",
        headers: {
            "Authorization": `Basic ${credenciais}`,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
    });

    if (!resposta.ok) {
        throw new Error(`Falha ao autenticar com a Blizzard (${resposta.status}). Confira BLIZZARD_CLIENT_ID/SECRET.`);
    }

    const dados = await resposta.json();
    tokenCache = {
        token: dados.access_token,
        expiraEm: Date.now() + (dados.expires_in ?? 86400) * 1000,
    };
    return tokenCache.token;
}

// Realm slugs da Blizzard são minúsculos, sem acento, espaço vira hífen.
function slugificarReino(reino: string): string {
    return reino
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "") // remove acentos
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

const MAPA_FACCAO: Record<string, string> = { HORDE: "horda", ALLIANCE: "alianca" };

interface PersonagemNormalizado {
    personagem: string;
    reino: string;
    faccao: string | null;
    raca: string | null;
    classe: string | null;
    nivel: number | null;
    guilda: string | null;
    ilvl_medio: number | null;
    avatar_url: string | null;
    dados_blizzard: Record<string, unknown>;
}

// Busca perfil + equipamento + mídia de um personagem e normaliza. Lança
// erro com mensagem já pronta pra mostrar ao admin (personagem/reino
// errado, ou API fora do ar) — quem chama só precisa repassar a mensagem.
async function buscarPersonagem(
    regiao: string,
    namespace: string,
    reino: string,
    personagem: string
): Promise<PersonagemNormalizado> {
    const token = await obterTokenBlizzard(regiao);
    const realmSlug = slugificarReino(reino);
    const nomeLower = personagem.toLowerCase().trim();
    const base = `https://${regiao}.api.blizzard.com/profile/wow/character/${realmSlug}/${encodeURIComponent(nomeLower)}`;

    const headers = {
        "Authorization": `Bearer ${token}`,
        "Battlenet-Namespace": namespace,
    };

    async function chamarApi(caminho: string) {
        const resp = await fetch(`${base}${caminho}?namespace=${encodeURIComponent(namespace)}&locale=en_US`, { headers });

        if (resp.status === 404) {
            throw new Error(`Personagem "${personagem}" não encontrado no reino "${reino}". Confira o nome, o reino, se o namespace do campeonato (${namespace}) está certo — e se o personagem já passou do nível 10 (a API da Blizzard não indexa personagens abaixo disso).`);
        }
        if (resp.status === 401 || resp.status === 403) {
            throw new Error("Credenciais da API da Blizzard inválidas ou sem permissão (confira BLIZZARD_CLIENT_ID/SECRET).");
        }
        if (!resp.ok) {
            throw new Error(`API da Blizzard respondeu ${resp.status} — provavelmente fora do ar. Tente de novo em instantes.`);
        }
        return resp.json();
    }

    const perfil = await chamarApi("");

    // Equipamento e mídia são "best effort": se falharem (ex: personagem
    // sem itens equipados, ou sem render de mídia disponível), o cadastro
    // continua — só ficam null, não interrompe o alistamento por causa de
    // um campo secundário.
    let ilvlMedio: number | null = null;
    try {
        const equipamento = await chamarApi("/equipment");
        const itens = (equipamento.equipped_items ?? []) as Array<{ level?: { value?: number } }>;
        const niveis = itens.map((it) => it.level?.value).filter((v): v is number => typeof v === "number");
        if (niveis.length > 0) {
            ilvlMedio = Math.round((niveis.reduce((a, b) => a + b, 0) / niveis.length) * 10) / 10;
        }
    } catch {
        // segue sem iLvl
    }

    let avatarUrl: string | null = null;
    try {
        const midia = await chamarApi("/character-media");
        const avatar = (midia.assets ?? []).find((a: { key?: string }) => a.key === "avatar");
        avatarUrl = avatar?.value ?? null;
    } catch {
        // segue sem avatar
    }

    return {
        personagem: perfil.name ?? personagem,
        reino: perfil.realm?.name ?? reino,
        faccao: MAPA_FACCAO[perfil.faction?.type] ?? null,
        raca: perfil.race?.name ?? null,
        classe: perfil.character_class?.name ?? null,
        nivel: perfil.level ?? null,
        guilda: perfil.guild?.name ?? null,
        ilvl_medio: ilvlMedio,
        avatar_url: avatarUrl,
        dados_blizzard: { perfil },
    };
}

Deno.serve(async (req) => {
    const CORS_HEADERS = construirCorsHeaders(req.headers.get("origin"));

    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: CORS_HEADERS });
    }

    try {
        const corpo = await req.json();
        const { campeonato_id, personagem, reino, acao } = corpo;

        if (!campeonato_id || typeof campeonato_id !== "string") {
            return new Response(JSON.stringify({ error: "campeonato_id é obrigatório." }), {
                status: 400,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            });
        }

        // 1) Confere is_admin() com o JWT de quem chamou — mesma checagem
        // das outras Edge Functions do projeto.
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
            return new Response(JSON.stringify({ error: "Apenas administradores podem buscar dados na API da Blizzard." }), {
                status: 403,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            });
        }

        // 2) Busca a configuração do campeonato (região + namespace) —
        // leitura pública via RLS, então o client com o JWT do chamador já
        // enxerga essa linha sem precisar de Service Role.
        const { data: campeonato, error: campeonatoError } = await supabaseComoChamador
            .from("arena_campeonatos")
            .select("id, regiao, namespace_blizzard")
            .eq("id", campeonato_id)
            .maybeSingle();

        if (campeonatoError) {
            return new Response(JSON.stringify({ error: campeonatoError.message }), {
                status: 500,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            });
        }
        if (!campeonato) {
            return new Response(JSON.stringify({ error: "Campeonato não encontrado." }), {
                status: 404,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            });
        }
        if (!campeonato.regiao || !campeonato.namespace_blizzard) {
            return new Response(JSON.stringify({ error: "Este campeonato ainda não tem região/namespace da Blizzard configurados." }), {
                status: 409,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            });
        }

        const regiao = campeonato.regiao.toLowerCase();
        const namespace = campeonato.namespace_blizzard;

        // 3) Modo "ressincronizar": busca de novo TODOS os participantes já
        // inscritos nesse campeonato e atualiza os dados de cada um.
        // Sequencial (não em paralelo) de propósito — volume esperado é de
        // dezenas de participantes por campeonato, não milhares; chamar a
        // API da Blizzard em sequência evita esbarrar em rate limit sem
        // precisar de lógica de retry/backoff.
        if (acao === "ressincronizar_todos") {
            const { data: participantes, error: participantesError } = await supabaseComoChamador
                .from("arena_participantes")
                .select("id, personagem, reino")
                .eq("campeonato_id", campeonato_id);

            if (participantesError) {
                return new Response(JSON.stringify({ error: participantesError.message }), {
                    status: 500,
                    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
                });
            }

            const falhas: { personagem: string; motivo: string }[] = [];
            let sucesso = 0;

            for (const p of participantes ?? []) {
                try {
                    const normalizado = await buscarPersonagem(regiao, namespace, p.reino, p.personagem);
                    const { error: updateError } = await supabaseComoChamador
                        .from("arena_participantes")
                        .update({
                            faccao: normalizado.faccao,
                            raca: normalizado.raca,
                            classe: normalizado.classe,
                            nivel: normalizado.nivel,
                            guilda: normalizado.guilda,
                            ilvl_medio: normalizado.ilvl_medio,
                            avatar_url: normalizado.avatar_url,
                            dados_blizzard: normalizado.dados_blizzard,
                            sincronizado_em: new Date().toISOString(),
                        })
                        .eq("id", p.id);

                    if (updateError) throw new Error(updateError.message);
                    sucesso++;
                } catch (erro) {
                    falhas.push({ personagem: p.personagem, motivo: String((erro as Error).message ?? erro) });
                }
            }

            return new Response(JSON.stringify({ success: true, total: (participantes ?? []).length, sucesso, falhas }), {
                status: 200,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            });
        }

        // 4) Modo padrão: busca 1 personagem (ainda não inscrito) e
        // devolve os dados normalizados pra pré-visualização — quem grava
        // em arena_participantes é o painel, só depois que o admin clicar
        // em "Confirmar inscrição".
        if (!personagem || !reino) {
            return new Response(JSON.stringify({ error: "personagem e reino são obrigatórios." }), {
                status: 400,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            });
        }

        const normalizado = await buscarPersonagem(regiao, namespace, reino, personagem);

        return new Response(JSON.stringify({ success: true, personagem: normalizado }), {
            status: 200,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: String((err as Error).message ?? err) }), {
            status: 502,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
    }
});
