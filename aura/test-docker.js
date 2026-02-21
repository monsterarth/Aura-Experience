// test-docker.js
async function testarDockerDireto() {
  console.log("⏳ Enviando POST direto para o container Docker (porta 3001)...");
  
  try {
    const response = await fetch("http://localhost:3001/api/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // IMPORTANTE: Se você mudou a chave no server.js do Docker, coloque a mesma aqui
        "x-api-key": "Fazenda@2025" 
      },
      body: JSON.stringify({
        number: "5551996678810",
        message: "🔥 TESTE DIRETO: O container do Docker está funcionando perfeitamente!"
      })
    });

    const data = await response.json();
    console.log("✅ Resposta do Docker:", data);
  } catch (error) {
    console.error("❌ Erro ao conectar no Docker. Ele está rodando?", error.message);
  }
}

testarDockerDireto();