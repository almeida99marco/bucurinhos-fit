# Bucurinho's Fit

Tema claro (branco + verde ou branco + vermelho, escolhido no Perfil).

Aplicativo de saúde, nutrição e treino para duas contas independentes (expansível), com IA para dietas e sugestões de treino.

**Stack:** React + TypeScript + Vite + Tailwind · Supabase (Auth, Postgres com RLS, Storage, Edge Functions) · Recharts.

## Onde o app roda (principal): dentro do Claude

O app publicado como artefato no claude.ai detecta o Claude e passa a usar:
- **Conta Claude** como login (sem cadastro/senha);
- **Banco do artefato** (`db`): dados de cada pessoa em `data/users/<id>/`, privados até do dono do app;
  o que a pessoa autoriza é copiado para `shares/<id>` (só ela grava; quem tem acesso ao app lê);
- **Claude** (`sample`) para dietas, substituições e assistente de treino (`src/lib/claudeAI.ts`);
- **Downloads** do Claude para exportar CSV/JSON.

Arquivos: `src/lib/artifactBackend.ts`, `src/lib/claudeAI.ts`, `src/lib/claudeRuntime.ts`.
Build do arquivo único: `npm run build:preview` → `dist-preview/index.html`.

## Estrutura

```
src/
  lib/backend.ts        camada de dados (Supabase ou prévia local sem servidor)
  lib/calc.ts           TMB/TDEE (Mifflin-St Jeor), metas calóricas com piso de segurança
  pages/                Início, Nutrição, Treinos (+ execução), Corrida, Evolução,
                        Calendário, Assistente IA, Perfil, Compartilhados, Auth
supabase/
  migrations/           tabelas, índices, RLS, storage, triggers, biblioteca de exercícios
  functions/ai-nutrition  gera dieta, substitui refeição/alimento (chave de IA só no servidor)
  functions/ai-coach      sugestões de musculação/corrida (ficam "pendentes" até aprovação) e perguntas
```

## Levar para o Lovable

1. Crie um projeto em branco no Lovable e ative o **Lovable Cloud** (Supabase).
2. Em **GitHub → Connect**, deixe o Lovable criar o repositório.
3. Clone esse repositório, copie todo o conteúdo desta pasta por cima e faça `git push`. O Lovable sincroniza sozinho.
4. Peça ao Lovable: *"Aplique as migrações em supabase/migrations e publique as edge functions ai-nutrition e ai-coach"*.
5. IA — escolha o provedor pelos secrets do Supabase (Edge Functions → Secrets):
   - **Google Gemini (grátis):** defina `GEMINI_API_KEY` (chave criada em aistudio.google.com). Tem prioridade sobre os demais.
   - **Claude (Anthropic):** defina `ANTHROPIC_API_KEY` (chave criada em console.anthropic.com). Opcional: `AI_MODEL` (padrão `claude-sonnet-5-5`).
   - **Sem configurar nada:** usa o `LOVABLE_API_KEY` do Lovable Cloud (AI Gateway, consome créditos do Lovable).
   - **Outro provedor compatível com OpenAI:** `AI_API_KEY`, `AI_API_URL` e `AI_MODEL`.
6. Em Auth → URL Configuration, inclua a URL do app (necessário para os e-mails de confirmação e recuperação de senha).

O cliente lê `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` (ou `VITE_SUPABASE_ANON_KEY`). Sem essas variáveis, o app roda em **modo de prévia local**, salvando no navegador, sem IA e sem e-mails.

## Rodar localmente

```bash
npm install
cp .env.example .env.local   # preencha com seu projeto Supabase
npm run dev
```

## Regras de negócio importantes

- **Isolamento:** todas as tabelas têm `user_id` + RLS (select/insert/update/delete só do dono). Triggers impedem vincular registros filhos a registros pais de outro usuário.
- **Compartilhamento:** apenas por autorização expressa (`data_shares`), por escopo (evolução, fotos, treinos, corrida, nutrição), somente leitura e revogável.
- **Corrida:** habilitada por padrão no cadastro masculino. A aba e a rota ficam ocultas quando desabilitadas, e a opção pode ser alterada no Perfil. Tabela preparada para Strava/Garmin/Apple Health (`source`, `external_id`).
- **Segurança da IA:** calorias calculadas no servidor com piso de 1200/1500 kcal, sem déficit se o IMC for < 18,5, alerta para condições de saúde e bloqueio para menores de 18 anos. O volume de corrida é limitado a +10% por semana no servidor, e as sugestões só entram na agenda após aprovação.
- **Dieta personalizada:** objetivo principal + objetivos complementares (ex.: ganho de massa + performance na corrida), objetivo descrito livremente e carga de treino (dias de musculação, km/semana, horário). As calorias somam o gasto estimado da corrida; com foco em performance, o carboidrato mínimo é de 5–8 g/kg; a proteína fica em ~2 g/kg no ganho de massa; a IA posiciona pré e pós-treino e explica ajustes para dia de longão e de descanso.
- **Fotos:** buckets privados, com URLs assinadas e pasta por usuário.

## Testes executados

- Migração aplicada em PostgreSQL 16 com stubs do Supabase e testes de RLS: isolamento entre contas, bloqueio de escrita cruzada, storage, compartilhamento por escopo e revogação.
- Edge functions verificadas com `deno check`.
- 21 cenários ponta a ponta no navegador (mobile e desktop), na prévia local: cadastro, login, separação das contas, água, medidas, gráficos, divisão de treino, execução com cronômetro, corrida, metas, plano alimentar, lembretes e compartilhamento.
