const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3001;
const API_KEY = process.env.WHATSAPP_API_KEY || 'Fazenda@2025';
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'http://host.docker.internal:3000/api/webhook/whatsapp';
const PROPERTY_ID = process.env.PROPERTY_ID || 'fazenda-modelo-aura';
// Define o IP público (idealmente viria de uma variável de ambiente)
const SERVER_URL = process.env.SERVER_URL || 'http://187.77.57.154:3001';

app.use(cors());
app.use(express.json());

// ==========================================
// 🗄️ SERVIDOR DE MÍDIA & SISTEMA DE LIMPEZA
// ==========================================
const mediaFolderPath = path.join(__dirname, 'media');
if (!fs.existsSync(mediaFolderPath)) {
    fs.mkdirSync(mediaFolderPath);
}

// Expõe a pasta media para a internet
app.use('/media', express.static(mediaFolderPath));

// Rotina do Lixeiro: Roda a cada 24 horas e apaga arquivos com mais de 7 dias
const CLEANUP_DAYS = 7;
setInterval(() => {
    console.log('🧹 Iniciando rotina de limpeza de mídias antigas...');
    fs.readdir(mediaFolderPath, (err, files) => {
        if (err) return console.error('Erro ao ler pasta de mídia:', err);
        const now = Date.now();
        files.forEach(file => {
            const filePath = path.join(mediaFolderPath, file);
            fs.stat(filePath, (err, stats) => {
                if (err) return;
                const fileAgeMs = now - stats.mtime.getTime();
                const maxAgeMs = CLEANUP_DAYS * 24 * 60 * 60 * 1000;
                if (fileAgeMs > maxAgeMs) {
                    fs.unlink(filePath, () => console.log(`🗑️ Mídia apagada (expirada): ${file}`));
                }
            });
        });
    });
}, 24 * 60 * 60 * 1000); // 24 horas em milissegundos
// ==========================================

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
        const targetId = isOutbound ? msg.to : msg.from;
        let rawContactNumber = targetId.split('@')[0];

        // 🕵️‍♂️ O EXTRATOR DE MÁSCARAS (LID Resolver)
        // Se o WhatsApp tentar esconder o usuário atrás de um LID, nós forçamos a busca pelo número real
        if (targetId.includes('@lid')) {
            try {
                const contact = await client.getContactById(targetId);
                if (contact && contact.number) {
                    rawContactNumber = contact.number; // Arranca a máscara e pega o telefone de verdade!
                    console.log(`\n🕵️‍♂️ [LID RESOLVIDO] O ID ${targetId} na verdade é o número +${rawContactNumber}`);
                }
            } catch (err) {
                console.error('\n⚠️ Aviso: Não foi possível resolver o número por trás do LID.', err);
            }
        }

        const contactNumber = enforceBrazilian9Digit(rawContactNumber);
        const direction = isOutbound ? 'outbound' : 'inbound';
        
        let messageText = msg.body;
        let mediaBase64 = null;
        let mediaMimeType = null;
        let mediaUrl = null;

// 🧠 INTERCEPTADOR DE MÍDIA OMNICHANNEL (Áudio, Imagem, Figurinha)
        if (msg.hasMedia) {
            try {
                console.log(`\n⏳ Baixando mídia de ${contactNumber}...`);
                const media = await msg.downloadMedia();
                
                if (media) {
                    mediaBase64 = media.data; 
                    mediaMimeType = media.mimetype;
                    
                    let ext = media.mimetype.split('/')[1].split(';')[0];
                    if (ext === 'jpeg') ext = 'jpg';
                    
                    const fileName = `${msg.id.id}.${ext}`;
                    const filePath = path.join(mediaFolderPath, fileName);
                    fs.writeFileSync(filePath, mediaBase64, 'base64');
                    
                    mediaUrl = `${SERVER_URL}/media/${fileName}`;
                    console.log(`✅ Mídia salva localmente: ${mediaUrl}`);

                    // 🛑 O PULO DO GATO: Se NÃO for áudio, esvazia o Base64 pro n8n tratar como texto comum!
                    if (msg.type !== 'ptt' && msg.type !== 'audio') {
                        mediaBase64 = null; 
                    }

                    if (msg.type === 'ptt' || msg.type === 'audio') messageText = '🎤 [Áudio Recebido - Processando transcrição...]';
                    else if (msg.type === 'image') messageText = '📷 ';
                    else if (msg.type === 'sticker') messageText = '👾 [Figurinha]';
                    else if (msg.type === 'video') messageText = '🎥 [Vídeo]';
                    else messageText = '📎 [Documento]';
                }
            } catch (err) {
                console.error('❌ Erro ao processar mídia:', err);
                messageText = '📎 [Erro ao baixar arquivo do WhatsApp]';
            }
        }

        else if (!messageText) {
            messageText = '📎 [Mídia Não Suportada]';
        }

        console.log(`\n💬 MENSAGEM CAPTURADA: ${direction.toUpperCase()} | Contato: ${contactNumber}`);

        try {
            const response = await fetch(WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    propertyId: PROPERTY_ID,
                    messageId: msg.id._serialized, // 👈 ADICIONE ESTA LINHA!
                    contactNumber: contactNumber,
                    text: messageText, 
                    direction: direction,
                    mediaBase64: mediaBase64,
                    mediaMimeType: mediaMimeType,
                    mediaUrl: mediaUrl // NOVO: Link direto do arquivo para a UI
                })
            });

            if (!response.ok) {
                console.error('⚠️ Aviso: O Webhook retornou um erro:', await response.text());
            } else {
                console.log('✅ Mensagem sincronizada com o n8n!');
            }
        } catch (fetchError) {
            console.error('❌ Erro ao contactar o Webhook:', fetchError.message);
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

// 🇧🇷 Normalizador de Nono Dígito para Entrada (Inbound)
function enforceBrazilian9Digit(number) {
    let clean = number.replace(/\D/g, '');
    
    // Se for Brasil e tiver 12 dígitos (está faltando um!)
    if (clean.startsWith('55') && clean.length === 12) {
        const firstDigitAfterDDD = clean.charAt(4);
        
        // Celulares antigos sem o 9 começavam com 6, 7, 8 ou 9.
        // Telefones fixos começam com 2, 3, 4 ou 5 (e não levam o 9).
        if (['6', '7', '8', '9'].includes(firstDigitAfterDDD)) {
            // Injeta o 9 mágico
            clean = clean.substring(0, 4) + '9' + clean.substring(4);
        }
    }
    return clean;
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

// ==========================================
// ⚡ VIA EXPRESSA: STATUS E REAÇÕES
// ==========================================
// Substitua pela URL real do seu sistema!
const STATUS_WEBHOOK_URL = process.env.STATUS_WEBHOOK_URL || 'https://aaura.app.br/api/webhook/whatsapp/status';

client.on('message_ack', async (msg, ack) => {
    try {
        await fetch(STATUS_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                propertyId: PROPERTY_ID,
                messageId: msg.id._serialized,
                type: 'ack',
                ack: ack
            })
        });
    } catch (err) {}
});

client.on('message_reaction', async (reaction) => {
    try {
        await fetch(STATUS_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                propertyId: PROPERTY_ID,
                messageId: reaction.msgId._serialized,
                type: 'reaction',
                reaction: reaction.reaction // O emoji (ou vazio se o hóspede remover)
            })
        });
    } catch (err) {}
});

client.initialize();

app.listen(port, () => {
    console.log(`\n🚀 Aura WhatsApp Service rodando na porta ${port}`);
    console.log(`🔗 Webhook configurado para apontar para: ${WEBHOOK_URL}\n`);
});