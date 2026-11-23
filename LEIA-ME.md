# Solo Leveling 2D — servidor online

Este repositório contém o servidor de contas, salvamento e presença/movimento multiplayer.

## Publicar no Render
1. Crie um serviço **Web Service** conectado a este repositório.
2. Build command: `npm install`
3. Start command: `npm start`
4. Em Environment, defina `JWT_SECRET` com uma chave aleatória longa (mínimo 32 caracteres).
5. Publique e copie a URL HTTPS do serviço.

## Conectar o jogo
No menu do jogo, abra **JOGAR ONLINE / CONTA**, informe a URL HTTPS do servidor, crie uma conta e toque em **Conectar ao mundo online**.

## Importante
- O servidor só ficará online depois de publicado no Render ou serviço equivalente.
- O arquivo `data.json` é criado automaticamente. Configure armazenamento persistente no host para preservar contas e saves entre reinicializações.
- Não compartilhe sua senha nem o valor de `JWT_SECRET`.
- O multiplayer implementado sincroniza presença e posição dos jogadores; não significa que combate, monstros e todo o mundo estejam sincronizados.
