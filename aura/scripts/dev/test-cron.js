// test-cron.js
const CRON_SECRET = "minha_senha_super_secreta_do_cron_123"; // Coloque a senha do seu .env aqui

async function testCron() {
  console.log("⏳ Disparando Cron Job manualmente...");
  
  try {
    const response = await fetch("http://localhost:3000/api/cron/process-messages", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${CRON_SECRET}`
      }
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error("❌ Falha na requisição:", data);
      return;
    }

    console.log("✅ Resultado do Cron:", data);
  } catch (error) {
    console.error("❌ Erro ao conectar no Next.js (ele está rodando?):", error.message);
  }
}