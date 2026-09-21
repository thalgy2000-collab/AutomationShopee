# Guia Prático de Hospedagem em VPS — Central de Automação Shopee 🚀

Este guia ensina o passo a passo completo para hospedar a automação em um **Servidor VPS Linux (Ubuntu 22.04 ou 24.04)** com Docker e Playwright rodando 24 horas por dia, 7 dias por semana.

---

## 1. Configuração Recomendada da VPS

Como o **Agente 3** executa navegadores reais (Chromium Headless via Playwright) e o **Agente 2** processa imagens e inteligência artificial, a configuração mínima indicada é:

* **CPU:** 2 vCPUs
* **Memória RAM:** 4 GB *(Recomendado para evitar travamento do navegador ao abrir múltiplas páginas)*
* **Disco:** 40 GB SSD / NVMe
* **Sistema Operacional:** Ubuntu 22.04 LTS ou Ubuntu 24.04 LTS
* **Provedores recomendados:**
  * **Hetzner Cloud:** Plano CX22 (~€ 4/mês ou ~R$ 25/mês) — *Melhor custo-benefício*
  * **Contabo:** Cloud VPS S (~€ 5.50/mês — 8GB RAM)
  * **DigitalOcean:** Basic Droplet ($24/mês)
  * **AWS EC2:** Instância `t3.medium` ou `t4g.medium`

---

## 2. Como Subir o Projeto para a VPS

### Opção A: Via Git / GitHub (Mais fácil)
No terminal da sua VPS:
```bash
git clone <URL_DO_SEU_REPOSITORIO> shopee-automation
cd shopee-automation
```

### Opção B: Enviando os arquivos do seu PC direto para a VPS
No terminal do seu computador (Windows PowerShell):
```powershell
scp -r "c:\Users\marke\.gemini\antigravity-ide\scratch\shopee-automation" root@IP_DA_SUA_VPS:/root/shopee-automation
```

---

## 3. Inicialização Rápida com Docker (Recomendado)

Na sua VPS, entre na pasta do projeto:

```bash
cd shopee-automation
```

### Passo 1: Criar o arquivo de credenciais `.env`
```bash
cp .env.example .env
nano .env
```
Preencha suas credenciais do **Magis5** e chave da **API Gemini**:
```env
PORT=3000
MAGIS5_EMAIL=seu_email@brkfishing.com.br
MAGIS5_PASSWORD=sua_senha
MAGIS5_INTEGRATION_NAME=Shopee BRK Fishing
GEMINI_API_KEY=sua_chave_gemini_aqui
HEADLESS=true
```
*(Para salvar no nano: aperte `Ctrl + O`, `Enter` e depois `Ctrl + X`)*.

### Passo 2: Executar o instalador automático
```bash
chmod +x deploy.sh
./deploy.sh
```

O script irá:
1. Instalar o Docker e Docker Compose na VPS se não estiverem presentes.
2. Construir o contêiner com imagem oficial do Playwright (`mcr.microsoft.com/playwright:v1.49.1-noble`).
3. Iniciar o servidor web na porta `3000`.

Pronto! Acesse pelo seu navegador:
👉 **`http://SEU_IP_DA_VPS:3000`**

---

## 4. Comandos Úteis do Dia a Dia

* **Ver os logs da automação em tempo real:**
  ```bash
  docker compose logs -f
  ```
* **Reiniciar o sistema:**
  ```bash
  docker compose restart
  ```
* **Parar o sistema:**
  ```bash
  docker compose down
  ```
* **Atualizar o sistema com novas alterações de código:**
  ```bash
  git pull
  docker compose up -d --build
  ```

---

## 5. (Opcional) Configurar Domínio Próprio com HTTPS (SSL Grátis)

Se você quiser acessar através de um domínio (ex: `painel.brkfishing.com.br`) com cadeado verde (HTTPS):

1. **Aponte o DNS:** Crie um registro tipo `A` no seu provedor de domínio (ex: Cloudflare / Registro.br) apontando para o IP da VPS.
2. **Instale o Nginx e o Certbot na VPS:**
   ```bash
   sudo apt update
   sudo apt install -y nginx certbot python3-certbot-nginx
   ```
3. **Crie a configuração do site no Nginx:**
   ```bash
   sudo nano /etc/nginx/sites-available/shopee
   ```
   Cole o conteúdo:
   ```nginx
   server {
       server_name painel.seu-dominio.com.br;

       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
           proxy_read_timeout 600s;
           proxy_connect_timeout 600s;
       }
   }
   ```
4. **Ative o site e gere o certificado SSL grátis:**
   ```bash
   sudo ln -s /etc/nginx/sites-available/shopee /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl reload nginx
   sudo certbot --nginx -d painel.seu-dominio.com.br
   ```

A partir desse momento, todo o painel e os agentes estarão protegidos e acessíveis publicamente via **`https://painel.seu-dominio.com.br`**!
