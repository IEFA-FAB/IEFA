// routes/home/tutorialData.ts

// Ícones aceitos (mantenha esta lista em sincronia com o mapa de ícones no Tutorial.tsx)
export type IconName =
  | "BookOpen"
  | "Settings"
  | "CalendarCheck"
  | "Save"
  | "QrCode"
  | "Camera"
  | "RefreshCw"
  | "HelpCircle"
  | "AlertTriangle"
  | "ShieldCheck"
  | "Info"
  | "Lock";

export interface StepItem {
  iconName: IconName;
  title: string;
  description: string;
  color: string; // classes tailwind (ex.: "border-blue-200")
}

export interface QAItem {
  question: string;
  answer: string;
}

export interface ButtonLink {
  to: string;
  label: string;
  variant?: "default" | "outline";
}

export const heroData = {
  badge: "Guia Rápido do SISUB",
  title: "Como usar o SISUB: Previsões e Fiscalização por QR",
  subtitle:
    "Siga este passo a passo para preencher suas previsões de refeições e realizar a fiscalização com segurança e rapidez.",
  primaryButton: { to: "/rancho", label: "Ir para Previsão" } as ButtonLink,
  secondaryButton: {
    to: "/fiscal",
    label: "Ir para Fiscal",
    variant: "outline",
  } as ButtonLink,
};

export const overviewCards: StepItem[] = [
  {
    iconName: "Settings",
    title: "Unidade Padrão",
    description:
      "Aplique a OM padrão aos dias sem unidade para acelerar o preenchimento.",
    color: "border-blue-100",
  },
  {
    iconName: "CalendarCheck",
    title: "Marque as Refeições",
    description: "Café, almoço, janta e ceia – selecione o que irá consumir.",
    color: "border-green-100",
  },
  {
    iconName: "Save",
    title: "Salvamento em Lote",
    description: "Use o botão flutuante para gravar as alterações pendentes.",
    color: "border-indigo-100",
  },
];

// Passos para a página de Previsão (Usuário)
export const ranchoSteps: StepItem[] = [
  {
    iconName: "QrCode",
    title: "Abra seu QR no cabeçalho",
    description:
      "Na página de Previsão (Rancho), clique no botão com ícone de QR no topo para exibir seu código. É ele que o fiscal irá ler.",
    color: "border-violet-200",
  },
  {
    iconName: "Settings",
    title: "Defina a Unidade Padrão",
    description:
      'Use "Unidade Padrão" para aplicar rapidamente a OM aos dias sem unidade definida.',
    color: "border-blue-200",
  },
  {
    iconName: "CalendarCheck",
    title: "Marque as Refeições",
    description:
      "Nos cards de cada dia, ative/desative café, almoço, janta e ceia conforme for consumir.",
    color: "border-green-200",
  },
  {
    iconName: "Lock",
    title: "Dias bloqueados (política)",
    description:
      "Por operação do rancho, não é possível editar Hoje, Amanhã e Depois de Amanhã. Planeje-se com antecedência.",
    color: "border-amber-200",
  },
  {
    iconName: "Save",
    title: "Salve Alterações",
    description:
      'Quando houver pendências, use o botão flutuante "Salvar alterações" para gravar tudo de uma vez.',
    color: "border-yellow-200",
  },
  {
    iconName: "RefreshCw",
    title: "Atualize Previsões",
    description:
      "Se necessário, clique em atualizar para recarregar os dados existentes.",
    color: "border-indigo-200",
  },
];

// Passos para a página do Fiscal (Leitor de QR)
export const fiscalSteps: StepItem[] = [
  {
    iconName: "Camera",
    title: "Permita o Acesso à Câmera",
    description:
      "Ao abrir o leitor, conceda a permissão da câmera. Sem isso, o scanner não inicia.",
    color: "border-blue-200",
  },
  {
    iconName: "QrCode",
    title: "Escaneie o QR do Militar",
    description:
      "Aponte a câmera para o QR do usuário (obtido pelo botão no cabeçalho da página de Previsão).",
    color: "border-green-200",
  },
  {
    iconName: "Info",
    title: "Confira a Previsão",
    description:
      "O sistema mostra a previsão para data, refeição e unidade atuais. Ajuste se necessário.",
    color: "border-yellow-200",
  },
  {
    iconName: "Save",
    title: "Confirme a Presença",
    description:
      'Confirme no diálogo. Com "Fechar Auto." ativo, a confirmação ocorre automaticamente após ~3s.',
    color: "border-indigo-200",
  },
  {
    iconName: "RefreshCw",
    title: "Pausar/Retomar e Atualizar",
    description:
      'Use "Pausar/Ler" para controlar o scanner e o botão de "refresh" se a câmera ficar instável.',
    color: "border-slate-200",
  },
];

export const tips: string[] = [
  "Planeje com antecedência: as edições para Hoje, Amanhã e Depois de Amanhã são bloqueadas.",
  "Sempre confirme a OM antes de salvar as seleções do dia.",
  "Leve seu QR aberto no celular quando chegar ao rancho para agilizar a fiscalização.",
  "Evite redes instáveis ao usar o leitor de QR.",
];

export const faqItems: QAItem[] = [
  {
    question: "Onde encontro meu QR para o rancho?",
    answer:
      "Na página de Previsão (Rancho), clique no botão com ícone de QR no cabeçalho. Um diálogo abrirá exibindo o seu QR e o seu ID.",
  },
  {
    question: "Por que não consigo editar dias próximos?",
    answer:
      "Por política operacional do rancho, as edições para Hoje, Amanhã e Depois de Amanhã são bloqueadas, permitindo o preparo adequado das refeições.",
  },
  {
    question: "Minhas alterações não salvaram",
    answer:
      "Verifique se há alterações pendentes e clique em “Salvar alterações”. Aguarde a confirmação antes de sair da página.",
  },
  {
    question: "Sem acesso à câmera",
    answer:
      "Conceda permissão ao navegador nas configurações do site (cadeado na barra de endereço) ou tente outro navegador/dispositivo.",
  },
];

export const troubleshooting: string[] = [
  "QR não lido: limpe a lente, ajuste a distância, melhore a iluminação e tente novamente.",
  "Scanner travado: use “Pausar/Ler” e o botão “refresh” no leitor.",
  "Dados desatualizados: na Previsão, use o botão de atualizar para recarregar as previsões salvas.",
];

export const privacy = {
  title: "Privacidade e Segurança",
  text: "O uso do QR e das previsões deve seguir as normas internas da OM. Em caso de dúvidas sobre dados e acessos, procure o responsável pelo sistema.",
};

export const ctaData = {
  title: "Pronto para aplicar?",
  text: "Acesse agora as páginas de Previsão e Fiscalização para colocar em prática os passos deste tutorial.",
  buttons: [
    { to: "/rancho", label: "Abrir Previsão →", variant: "default" as const },
    {
      to: "/fiscal",
      label: "Abrir Leitor de QR →",
      variant: "outline" as const,
    },
  ] as ButtonLink[],
};
