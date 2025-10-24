// routes/home/tutorial.tsx
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Button } from "@iefa/ui";
import Footer from "~/components/Footer";
import { JSX } from "react";
import {
  BookOpen,
  Settings,
  CalendarCheck,
  Save,
  QrCode,
  Camera,
  RefreshCw,
  HelpCircle,
  AlertTriangle,
  ShieldCheck,
  Info,
  Lock,
} from "lucide-react";
import type { Route } from "./+types/tutorial";

import {
  heroData,
  overviewCards,
  ranchoSteps,
  fiscalSteps,
  tips,
  faqItems,
  troubleshooting,
  privacy,
  ctaData,
  type IconName,
} from "./tutorialData";

// Mapa de ícones para transformar nomes (string) em componentes
const ICONS: Record<IconName, (props: { className?: string }) => JSX.Element> =
  {
    BookOpen: (props) => <BookOpen {...props} />,
    Settings: (props) => <Settings {...props} />,
    CalendarCheck: (props) => <CalendarCheck {...props} />,
    Save: (props) => <Save {...props} />,
    QrCode: (props) => <QrCode {...props} />,
    Camera: (props) => <Camera {...props} />,
    RefreshCw: (props) => <RefreshCw {...props} />,
    HelpCircle: (props) => <HelpCircle {...props} />,
    AlertTriangle: (props) => <AlertTriangle {...props} />,
    ShieldCheck: (props) => <ShieldCheck {...props} />,
    Info: (props) => <Info {...props} />,
    Lock: (props) => <Lock {...props} />,
  };

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Tutorial SISUB" },
    {
      name: "description",
      content:
        "Aprenda a usar o SISUB: como preencher previsões e como fiscalizar via QR.",
    },
  ];
}

export default function Tutorial() {
  const [isVisible, setIsVisible] = useState({
    hero: false,
    overview: false,
    rancho: false,
    fiscal: false,
    tips: false,
    faq: false,
    troubleshooting: false,
    privacy: false,
    cta: false,
  });

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          setIsVisible((prev) => ({
            ...prev,
            [entry.target.id]: entry.isIntersecting,
          }));
        });
      },
      { threshold: 0.1 }
    );

    document.querySelectorAll("[id]").forEach((el) => {
      observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50">
      {/* Hero */}
      <section
        id="hero"
        className={`container mx-auto px-4 pt-14 pb-10 transition-all duration-500 ${
          isVisible.hero
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-6"
        }`}
      >
        <div className="bg-white rounded-2xl border border-blue-100 shadow-sm p-8 md:p-10">
          <div className="flex items-start md:items-center md:justify-between flex-col md:flex-row gap-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm bg-blue-50 text-blue-700 border border-blue-200 mb-4">
                <BookOpen className="w-4 h-4" />
                {heroData.badge}
              </div>
              <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">
                {heroData.title}
              </h1>
              <p className="text-gray-600 max-w-2xl">{heroData.subtitle}</p>
            </div>
            <div className="flex gap-3">
              <Link
                to={heroData.primaryButton.to}
                aria-label="Ir para Previsão"
              >
                <Button className="cursor-pointer">
                  {heroData.primaryButton.label}
                </Button>
              </Link>
              <Link
                to={heroData.secondaryButton.to}
                aria-label="Ir para Fiscal"
              >
                <Button variant="outline" className="cursor-pointer">
                  {heroData.secondaryButton.label}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Visão Geral */}
      <section
        id="overview"
        className={`container mx-auto px-4 py-10 transition-all duration-500 delay-100 ${
          isVisible.overview
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-6"
        }`}
      >
        <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {overviewCards.map((card, idx) => {
            const Icon = ICONS[card.iconName];
            return (
              <div
                key={idx}
                className={`bg-white rounded-xl p-6 border-2 ${card.color} shadow-lg hover:shadow-xl transition-transform hover:scale-[1.01]`}
              >
                <div className="text-blue-600 mb-3">
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="font-semibold text-lg mb-1">{card.title}</h3>
                <p className="text-gray-600 text-sm">{card.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Tutorial do Usuário (Previsão) */}
      <section
        id="rancho"
        className={`bg-gray-50 py-14 transition-all duration-500 delay-150 ${
          isVisible.rancho
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-6"
        }`}
      >
        <div className="container mx-auto px-4">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">
              Preenchendo sua Previsão
            </h2>
            <p className="text-gray-600">
              Como usar a página de Previsão (Rancho) para informar suas
              refeições
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {ranchoSteps.map((s, i) => {
              const Icon = ICONS[s.iconName];
              return (
                <div
                  key={i}
                  className={`bg-white rounded-xl p-6 text-left border-2 ${s.color} shadow-lg hover:shadow-xl transition-all hover:scale-[1.02]`}
                >
                  <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center mb-4">
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="font-semibold mb-2">{s.title}</h3>
                  <p className="text-gray-600 text-sm">{s.description}</p>
                </div>
              );
            })}
          </div>

          <div className="mt-10 text-center">
            <Link to="/rancho">
              <Button className="cursor-pointer">
                Abrir página de Previsão
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Tutorial do Fiscal (QR) */}
      <section
        id="fiscal"
        className={`container mx-auto px-4 py-14 transition-all duration-500 delay-200 ${
          isVisible.fiscal
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-6"
        }`}
      >
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">
            Fiscalização com Leitura de QR
          </h2>
          <p className="text-gray-600">
            Passo a passo para usar o leitor e confirmar entradas
          </p>
        </div>

        <div className="grid md:grid-cols-3 lg:grid-cols-5 gap-6 max-w-6xl mx-auto">
          {fiscalSteps.map((s, i) => {
            const Icon = ICONS[s.iconName];
            return (
              <div
                key={i}
                className={`bg-white rounded-xl p-6 text-left border-2 ${s.color} shadow-lg hover:shadow-xl transition-all hover:scale-[1.02]`}
              >
                <div className="w-12 h-12 rounded-full bg-green-50 text-green-700 flex items-center justify-center mb-4">
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="font-semibold mb-2">{s.title}</h3>
                <p className="text-gray-600 text-sm">{s.description}</p>
              </div>
            );
          })}
        </div>

        <div className="bg-white rounded-xl border border-blue-100 shadow-sm p-6 mt-8 max-w-4xl mx-auto">
          <h3 className="font-semibold text-gray-900 mb-2">Dicas úteis</h3>
          <ul className="text-gray-600 text-sm list-disc pl-5 space-y-1">
            <li>Prefira a câmera traseira (environment) para melhor foco.</li>
            <li>Mantenha o QR visível e bem iluminado.</li>
            <li>
              Com “Fechar Auto.” ativo, a confirmação ocorre automaticamente
              após alguns segundos.
            </li>
            <li>
              Use “Pausar/Ler” para alternar o scanner e “refresh” se a câmera
              ficar instável.
            </li>
          </ul>
          <div className="mt-4">
            <Link to="/fiscal">
              <Button variant="outline" className="cursor-pointer">
                Abrir Leitor de QR
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Boas Práticas */}
      <section
        id="tips"
        className={`bg-gray-50 py-14 transition-all duration-500 delay-200 ${
          isVisible.tips
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-6"
        }`}
      >
        <div className="container mx-auto px-4">
          <div className="bg-white rounded-2xl p-8 border border-green-100 shadow-sm max-w-5xl mx-auto">
            <div className="flex items-center gap-2 text-green-700 mb-4">
              <ShieldCheck className="w-5 h-5" />
              <h3 className="text-xl font-bold">Boas Práticas</h3>
            </div>
            <ul className="text-gray-700 space-y-2 list-disc pl-6">
              {tips.map((tip, i) => (
                <li key={i}>{tip}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section
        id="faq"
        className={`container mx-auto px-4 py-14 transition-all duration-500 delay-200 ${
          isVisible.faq
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-6"
        }`}
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm bg-indigo-50 text-indigo-700 border border-indigo-200 mb-3">
            <HelpCircle className="w-4 h-4" />
            Dúvidas Frequentes
          </div>
          <h2 className="text-2xl font-bold text-gray-900">FAQ</h2>
        </div>

        <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
          {faqItems.map((qa, i) => (
            <div key={i} className="bg-white p-6 rounded-xl border shadow-sm">
              <h4 className="font-semibold mb-1">{qa.question}</h4>
              <p className="text-gray-600 text-sm">{qa.answer}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Troubleshooting */}
      <section
        id="troubleshooting"
        className={`bg-gray-50 py-14 transition-all duration-500 delay-200 ${
          isVisible.troubleshooting
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-6"
        }`}
      >
        <div className="container mx-auto px-4">
          <div className="bg-white rounded-2xl p-8 border border-red-100 shadow-sm max-w-5xl mx-auto">
            <div className="flex items-center gap-2 text-red-700 mb-4">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="text-xl font-bold">Resolução de Problemas</h3>
            </div>
            <ul className="text-gray-700 space-y-2 list-disc pl-6">
              {troubleshooting.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Privacidade */}
      <section
        id="privacy"
        className={`container mx-auto px-4 py-14 transition-all duration-500 delay-200 ${
          isVisible.privacy
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-6"
        }`}
      >
        <div className="bg-white rounded-2xl p-8 border border-slate-100 shadow-sm max-w-4xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-3">
            {privacy.title}
          </h2>
          <p className="text-gray-600">{privacy.text}</p>
        </div>
      </section>

      {/* CTA Final */}
      <section
        id="cta"
        className={`bg-gradient-to-r from-blue-600 to-blue-700 text-white py-16 transition-all duration-500 delay-250 ${
          isVisible.cta
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-6"
        }`}
      >
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">{ctaData.title}</h2>
          <p className="text-blue-100 text-lg mb-8 max-w-2xl mx-auto">
            {ctaData.text}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4">
            {ctaData.buttons.map((btn, i) => (
              <Link key={i} to={btn.to}>
                <Button
                  className={`cursor-pointer ${
                    btn.variant === "outline"
                      ? "bg-transparent text-white border-white/70 hover:bg-white/10"
                      : "bg-white text-blue-700 hover:bg-gray-100"
                  }`}
                  variant={btn.variant === "outline" ? "outline" : "default"}
                >
                  {btn.label}
                </Button>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <Footer />
    </div>
  );
}
