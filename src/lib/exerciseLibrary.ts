// Biblioteca base de exercícios (também inserida no banco pela migração SQL).
export type LibraryExercise = {
  name: string;
  muscle_group: string;
  description: string;
  instructions: string;
};

export const MUSCLE_GROUPS = [
  "Peito",
  "Costas",
  "Ombros",
  "Bíceps",
  "Tríceps",
  "Quadríceps",
  "Posteriores",
  "Glúteos",
  "Panturrilhas",
  "Abdômen",
  "Corpo inteiro",
];

export const EXERCISE_LIBRARY: LibraryExercise[] = [
  { name: "Supino reto com barra", muscle_group: "Peito", description: "Exercício base para peitoral maior, tríceps e deltoide anterior.", instructions: "Deite no banco com os pés firmes no chão. Segure a barra um pouco além da largura dos ombros, desça controlando até tocar levemente o peito e empurre até estender os cotovelos sem travar." },
  { name: "Supino inclinado com halteres", muscle_group: "Peito", description: "Enfatiza a porção clavicular do peitoral.", instructions: "Banco a 30–45°. Desça os halteres ao lado do peito com cotovelos a ~45° do tronco e empurre unindo-os acima do peito." },
  { name: "Crucifixo com halteres", muscle_group: "Peito", description: "Isolamento do peitoral com foco no alongamento.", instructions: "Com leve flexão nos cotovelos, abra os braços em arco até sentir alongamento no peito e retorne pelo mesmo caminho." },
  { name: "Crossover na polia", muscle_group: "Peito", description: "Isolamento do peitoral com tensão constante.", instructions: "Polias altas, um passo à frente. Traga as mãos para frente e para baixo, cruzando levemente, e volte controlando." },
  { name: "Flexão de braço", muscle_group: "Peito", description: "Exercício com peso corporal para peito, ombros e tríceps.", instructions: "Mãos na largura dos ombros, corpo alinhado da cabeça aos pés. Desça até o peito quase tocar o chão e empurre de volta." },
  { name: "Puxada frontal na polia", muscle_group: "Costas", description: "Trabalha latíssimo do dorso e bíceps.", instructions: "Pegada aberta, tronco levemente inclinado para trás. Puxe a barra até a parte alta do peito levando os cotovelos para baixo e volte devagar." },
  { name: "Remada curvada com barra", muscle_group: "Costas", description: "Desenvolve espessura das costas.", instructions: "Quadril para trás, coluna neutra, tronco inclinado ~45°. Puxe a barra em direção ao umbigo aproximando as escápulas." },
  { name: "Remada baixa na polia", muscle_group: "Costas", description: "Remada sentada para dorsais e romboides.", instructions: "Sente com joelhos levemente flexionados e coluna ereta. Puxe o triângulo até o abdômen e retorne alongando sem arredondar as costas." },
  { name: "Remada unilateral com halter", muscle_group: "Costas", description: "Trabalho unilateral das dorsais.", instructions: "Apoie joelho e mão no banco. Puxe o halter em direção ao quadril mantendo o tronco estável." },
  { name: "Barra fixa", muscle_group: "Costas", description: "Exercício com peso corporal para dorsais e bíceps.", instructions: "Pegada pronada, corpo estendido. Puxe até o queixo passar a barra e desça controlando até estender os braços." },
  { name: "Levantamento terra", muscle_group: "Posteriores", description: "Exercício composto para cadeia posterior.", instructions: "Barra sobre o meio do pé, coluna neutra. Empurre o chão com as pernas e estenda o quadril mantendo a barra próxima ao corpo." },
  { name: "Desenvolvimento com halteres", muscle_group: "Ombros", description: "Trabalha deltoides e tríceps.", instructions: "Sentado, halteres na altura das orelhas. Empurre para cima sem travar os cotovelos e desça controlando." },
  { name: "Elevação lateral", muscle_group: "Ombros", description: "Isolamento do deltoide lateral.", instructions: "Com leve flexão nos cotovelos, eleve os halteres lateralmente até a altura dos ombros e desça devagar." },
  { name: "Elevação frontal", muscle_group: "Ombros", description: "Isolamento do deltoide anterior.", instructions: "Eleve o halter à frente até a altura dos ombros, sem balançar o tronco." },
  { name: "Crucifixo invertido", muscle_group: "Ombros", description: "Trabalha deltoide posterior e parte alta das costas.", instructions: "Tronco inclinado à frente, abra os braços lateralmente aproximando as escápulas." },
  { name: "Rosca direta com barra", muscle_group: "Bíceps", description: "Exercício base para bíceps.", instructions: "Cotovelos junto ao corpo. Flexione os cotovelos levando a barra até os ombros e desça controlando." },
  { name: "Rosca alternada com halteres", muscle_group: "Bíceps", description: "Bíceps com supinação do punho.", instructions: "Alterne os braços girando o punho para cima durante a subida." },
  { name: "Rosca martelo", muscle_group: "Bíceps", description: "Trabalha braquial e braquiorradial.", instructions: "Pegada neutra (palmas para dentro). Flexione os cotovelos sem mover os ombros." },
  { name: "Tríceps na polia (corda)", muscle_group: "Tríceps", description: "Isolamento do tríceps.", instructions: "Cotovelos fixos ao lado do corpo. Estenda os braços abrindo a corda no final e volte devagar." },
  { name: "Tríceps testa", muscle_group: "Tríceps", description: "Isolamento do tríceps deitado.", instructions: "Deitado, braços estendidos. Flexione apenas os cotovelos levando a barra em direção à testa e estenda de volta." },
  { name: "Mergulho no banco", muscle_group: "Tríceps", description: "Tríceps com peso corporal.", instructions: "Mãos no banco atrás do corpo. Desça flexionando os cotovelos até ~90° e empurre de volta." },
  { name: "Agachamento livre", muscle_group: "Quadríceps", description: "Exercício composto para membros inferiores.", instructions: "Pés na largura dos ombros, barra apoiada no trapézio. Desça como se fosse sentar, joelhos alinhados com os pés, e suba empurrando o chão." },
  { name: "Leg press 45°", muscle_group: "Quadríceps", description: "Trabalha quadríceps e glúteos com apoio.", instructions: "Pés na plataforma na largura dos ombros. Desça até ~90° de flexão de joelho sem tirar o quadril do banco e empurre." },
  { name: "Cadeira extensora", muscle_group: "Quadríceps", description: "Isolamento do quadríceps.", instructions: "Ajuste o apoio no tornozelo. Estenda os joelhos completamente e desça controlando." },
  { name: "Afundo (passada)", muscle_group: "Quadríceps", description: "Exercício unilateral para pernas e glúteos.", instructions: "Dê um passo à frente e desça até os dois joelhos formarem ~90°. Empurre com a perna da frente para voltar." },
  { name: "Agachamento búlgaro", muscle_group: "Quadríceps", description: "Agachamento unilateral com pé de trás elevado.", instructions: "Pé de trás apoiado no banco. Desça verticalmente mantendo o tronco estável e suba pela perna da frente." },
  { name: "Mesa flexora", muscle_group: "Posteriores", description: "Isolamento dos isquiotibiais.", instructions: "Deitado de bruços, flexione os joelhos trazendo o rolo em direção aos glúteos e desça devagar." },
  { name: "Stiff com halteres", muscle_group: "Posteriores", description: "Posteriores de coxa e glúteos.", instructions: "Joelhos levemente flexionados, leve o quadril para trás descendo os halteres rente às pernas, coluna neutra, e volte contraindo os glúteos." },
  { name: "Elevação pélvica", muscle_group: "Glúteos", description: "Exercício principal para glúteo máximo.", instructions: "Costas apoiadas no banco, barra sobre o quadril. Eleve o quadril até alinhar com o tronco e contraia os glúteos no topo." },
  { name: "Abdução de quadril na máquina", muscle_group: "Glúteos", description: "Trabalha glúteo médio.", instructions: "Sentado, abra as pernas contra a resistência e retorne controlando." },
  { name: "Glúteo na polia (coice)", muscle_group: "Glúteos", description: "Isolamento do glúteo máximo.", instructions: "Tornozeleira na polia baixa. Estenda o quadril levando a perna para trás sem arquear a lombar." },
  { name: "Panturrilha em pé", muscle_group: "Panturrilhas", description: "Trabalha gastrocnêmio.", instructions: "Ponta dos pés na plataforma. Suba o máximo possível, pause e desça alongando." },
  { name: "Panturrilha sentado", muscle_group: "Panturrilhas", description: "Enfatiza o sóleo.", instructions: "Sentado, joelhos a 90°. Eleve os calcanhares e desça alongando." },
  { name: "Prancha", muscle_group: "Abdômen", description: "Estabilização do core.", instructions: "Antebraços no chão, corpo alinhado. Mantenha o abdômen contraído sem deixar o quadril cair." },
  { name: "Abdominal crunch", muscle_group: "Abdômen", description: "Reto abdominal.", instructions: "Deitado, joelhos flexionados. Eleve os ombros do chão contraindo o abdômen e desça devagar." },
  { name: "Elevação de pernas", muscle_group: "Abdômen", description: "Ênfase na porção inferior do abdômen.", instructions: "Deitado ou suspenso, eleve as pernas estendidas sem impulso e desça controlando." },
  { name: "Abdominal bicicleta", muscle_group: "Abdômen", description: "Reto abdominal e oblíquos.", instructions: "Alterne cotovelo em direção ao joelho oposto em movimento de pedalada." },
  { name: "Burpee", muscle_group: "Corpo inteiro", description: "Exercício metabólico de corpo inteiro.", instructions: "Agache, apoie as mãos, leve os pés para trás, faça uma flexão, volte os pés e salte." },
  { name: "Kettlebell swing", muscle_group: "Corpo inteiro", description: "Potência de quadril e condicionamento.", instructions: "Leve o kettlebell entre as pernas com o quadril para trás e projete-o à frente estendendo o quadril com força." },
];
