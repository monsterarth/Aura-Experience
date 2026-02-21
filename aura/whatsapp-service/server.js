const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3001;
const API_KEY = process.env.WHATSAPP_API_KEY || 'Fazenda@2025';
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'http://host.docker.internal:3000/api/webhook/whatsapp';
const PROPERTY_ID = process.env.PROPERTY_ID || 'fazenda-modelo-aura';

app.use(cors());
app.use(express.json());

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        executablePath: process.env.CHROME_BIN || null,
        args: [
            '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote',
            '--single-process', '--disable-gpu'
        ]
    }
});

let isClientReady = false;

client.on('qr', (qr) => {
    console.log('\n=========================================');
    console.log('📱 NOVO QR CODE GERADO. ESCANEIE AGORA:');
    console.log('=========================================\n');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('\n✅ Cliente WhatsApp conectado e pronto para disparar mensagens!\n');
    isClientReady = true;
});

const processedMessages = new Set();

// 🔥 MOTOR DE ESCUTA OMNICHANNEL + IDENTIFICAÇÃO DE MÍDIA
client.on('message_create', async (msg) => {
    try {
        if (processedMessages.has(msg.id._serialized)) return;
        processedMessages.add(msg.id._serialized);

        if (processedMessages.size > 500) {
            const firstItem = processedMessages.keys().next().value;
            processedMessages.delete(firstItem);
        }

        if (msg.from.includes('@g.us') || msg.to.includes('@g.us')) return;
        if (msg.from === 'status@broadcast' || msg.to === 'status@broadcast') return;

        const isOutbound = msg.fromMe;
        const contactNumber = isOutbound ? msg.to.replace('@c.us', '') : msg.from.replace('@c.us', '');
        const direction = isOutbound ? 'outbound' : 'inbound';

        // 🧠 TRADUTOR DE MÍDIA PARA TEXTO
        let messageText = msg.body;
        
        // Se a mensagem não tiver texto (foto, áudio, etc), definimos um fallback baseado no tipo
        if (!messageText) {
            switch (msg.type) {
                case 'image': messageText = '📷 [Imagem]'; break;
                case 'video': messageText = '🎥 [Vídeo]'; break;
                case 'audio':
                case 'ptt': messageText = '🎤 [Mensagem de Voz]'; break;
                case 'sticker': messageText = '👾 [Figurinha / Sticker]'; break;
                case 'document': messageText = '📄 [Documento]'; break;
                case 'location': messageText = '📍 [Localização Partilhada]'; break;
                case 'vcard':
                case 'multi_vcard': messageText = '📇 [Contato Partilhado]'; break;
                case 'revoked': messageText = '🚫 [Mensagem Apagada]'; break;
                default: messageText = '📎 [Mídia Não Suportada]';
            }
        }

        console.log(`\n💬 MENSAGEM CAPTURADA: ${direction.toUpperCase()} | Contato: ${contactNumber}`);
        console.log(`Tipo: ${msg.type} | Conteúdo: ${messageText}`);

        try {
            const response = await fetch(WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    propertyId: PROPERTY_ID,
                    contactNumber: contactNumber,
                    text: messageText, // Agora nunca estará vazio!
                    direction: direction
                })
            });

            if (!response.ok) {
                console.error('⚠️ Aviso: O Webhook retornou um erro:', await response.text());
            } else {
                console.log('✅ Mensagem sincronizada com o Next.js (Firestore)!');
            }
        } catch (fetchError) {
            console.error('❌ Erro ao contactar o Webhook do Next.js:', fetchError.message);
        }

    } catch (error) {
        console.error('❌ Erro crítico no motor de escuta:', error);
    }
});

client.on('disconnected', (reason) => {
    console.error('\n❌ Cliente WhatsApp desconectado. Motivo:', reason);
    isClientReady = false;
});

const authenticateToken = (req, res, next) => {
    const clientApiKey = req.headers['x-api-key'];
    if (!clientApiKey || clientApiKey !== API_KEY) {
        return res.status(401).json({ error: 'Unauthorized: Invalid API Key' });
    }
    next();
};

app.get('/api/status', authenticateToken, (req, res) => {
    res.json({ ready: isClientReady });
});

function formatBrazilianNumber(number) {
    let cleanNumber = number.replace(/\D/g, ''); 
    if (cleanNumber.startsWith('55')) {
        const ddd = parseInt(cleanNumber.substring(2, 4));
        if (ddd > 27) {
            if (cleanNumber.length === 13 && cleanNumber.charAt(4) === '9') {
                cleanNumber = cleanNumber.substring(0, 4) + cleanNumber.substring(5);
            }
        } else {
            if (cleanNumber.length === 12) {
                cleanNumber = cleanNumber.substring(0, 4) + '9' + cleanNumber.substring(4);
            }
        }
    }
    return `${cleanNumber}@c.us`;
}

app.post('/api/send', authenticateToken, async (req, res) => {
    try {
        if (!isClientReady) {
            return res.status(503).json({ error: 'WhatsApp client is not ready.' });
        }

        const { number, message } = req.body;
        if (!number || !message) return res.status(400).json({ error: 'Parameters "number" and "message" are required.' });

        const formattedId = formatBrazilianNumber(number);
        const response = await client.sendMessage(formattedId, message);
        
        console.log(`📤 Mensagem enviada via API para ${formattedId}`);
        res.status(200).json({ success: true, messageId: response.id._serialized });

    } catch (error) {
        console.error('❌ Erro ao enviar mensagem API:', error);
        res.status(500).json({ error: 'Failed to send message', details: error.message });
    }
});

client.initialize();

app.listen(port, () => {
    console.log(`\n🚀 Aura WhatsApp Service rodando na porta ${port}`);
    console.log(`🔗 Webhook configurado para apontar para: ${WEBHOOK_URL}\n`);
});