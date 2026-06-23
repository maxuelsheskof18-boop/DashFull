const axios = require('axios');
const admin = require('firebase-admin');

// 🔥 Inicialização segura do Firebase para ambiente Serverless
if (!admin.apps.length) {
  // Puxa a credencial de forma dinâmica e segura da memória da Vercel
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://dashfulll-2321b-default-rtdb.firebaseio.com" // Link do seu projeto
  });
}

const db = admin.database();

// 🥷 EXPORT OFICIAL DA FUNÇÃO VERCEL
module.exports = async (req, res) => {
    // Configuração de cabeçalhos CORS para o seu painel conseguir ler os dados
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    let todosOsEnvios = [];

    try {
        // 🔄 Procura a lista de cookies atualizada direto no seu Firebase
        const snapshot = await db.ref('config_contas').once('value');
        const contasDoBanco = snapshot.val();
        
        if (!contasDoBanco) {
            return res.status(200).json([]);
        }

        const listaContas = Object.values(contasDoBanco);

        for (const conta of listaContas) {
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
                
                const enviosFormatados = bruto.map(envio => {
                    const declaradas = envio.products_count || 0; 
                    const recebidas = envio.on_sale_units || 0;   
                    const dataReservada = envio.appointment && envio.appointment.date ? envio.appointment.date : (envio.date_created || new Date().toISOString());
                    const mapaGalpoes = { 'BRSP06': 'Araçariguama', 'BRRC01': 'Perus' };

                    return {
                        conta: conta.nome,
                        id_envio: envio.id || envio.inbound_id,
                        status: envio.status || 'unknown',
                        unidades_declaradas: declaradas,
                        unidades_recebidas: recebidas,
                        galpao: mapaGalpoes[envio.logistic_center_id] || envio.logistic_center_id || '---',
                        data: dataReservada
                    };
                });

                todosOsEnvios = todosOsEnvios.concat(enviosFormatados);

            } catch (erro) {
                console.error(`❌ Erro na API da conta [${conta.nome}]:`, erro.message);
            }
        }
    } catch (erroBanco) {
        return res.status(500).json({ error: erroBanco.message });
    }

    // Ordena por data e devolve o JSON puro
    const ordenados = todosOsEnvios.sort((a, b) => new Date(b.data) - new Date(a.data));
    return res.status(200).json(ordenados);
};