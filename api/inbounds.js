const axios = require('axios');
const admin = require('firebase-admin');

// 🥷 EXPORT OFICIAL DA FUNÇÃO VERCEL
module.exports = async (req, res) => {
    // Configuração de cabeçalhos CORS para a nuvem
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // 🔒 INICIALIZAÇÃO DO FIREBASE
    try {
        if (!admin.apps.length) {
            if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
                return res.status(500).json({ error: "Variável FIREBASE_SERVICE_ACCOUNT ausente na Vercel." });
            }
            const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                databaseURL: "hhttps://dashfulll-2321b-default-rtdb.firebaseio.com"
            });
        }
    } catch (err) {
        return res.status(500).json({ error: "Erro ao inicializar Firebase", details: err.message });
    }

    try {
        const db = admin.database();
        const snapshot = await db.ref('config_contas').once('value');
        const contasDoBanco = snapshot.val();
        
        if (!contasDoBanco) {
            return res.status(200).json([]);
        }

        const listaContas = Object.values(contasDoBanco);

        // ⚡ RESOLUÇÃO DO TIMEOUT: Consulta as 4 APIs do Mercado Livre EM PARALELO de uma vez só
        const promessas = listaContas.map(async (conta) => {
            try {
                const urlNavegador = `https://myaccount.mercadolivre.com.br/api/shipping/inbounds/search?limit=30&offset=0`;
                
                const resposta = await axios.get(urlNavegador, {
                    maxRedirects: 0,
                    validateStatus: (status) => status >= 200 && status < 303,
                    headers: {
                        'accept': 'application/json, text/plain, */*',
                        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'cookie': conta.cookie,
                        'x-requested-with': 'XMLHttpRequest'
                    }
                });

                const bruto = resposta.data.results || resposta.data.data || [];
                
                return bruto.map(envio => {
                    const mapaGalpoes = { 'BRSP06': 'Araçariguama', 'BRRC01': 'Perus' };
                    return {
                        conta: conta.nome,
                        id_envio: envio.id || envio.inbound_id,
                        status: envio.status || 'unknown',
                        unidades_declaradas: envio.products_count || 0,
                        unidades_recebidas: envio.on_sale_units || 0,
                        galpao: mapaGalpoes[envio.logistic_center_id] || envio.logistic_center_id || '---',
                        data: envio.appointment && envio.appointment.date ? envio.appointment.date : (envio.date_created || new Date().toISOString())
                    };
                });
            } catch (erroApi) {
                console.error(`❌ Erro na conta [${conta.nome}]:`, erroApi.message);
                return []; // Se uma conta falhar ou expirar o cookie, retorna vazio e não quebra as outras!
            }
        });

        // Aguarda todas as contas responderem juntas
        const resultados = await Promise.all(promessas);
        const todosOsEnvios = resultados.flat(); // Junta os arrays de envios em um só

        const ordenados = todosOsEnvios.sort((a, b) => new Date(b.data) - new Date(a.data));
        return res.status(200).json(ordenados);

    } catch (erroBanco) {
        return res.status(500).json({ error: "Erro operacional no banco de dados", details: erroBanco.message });
    }
};
