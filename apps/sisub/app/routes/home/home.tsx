import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router";
import Footer from "~/components/Footer";
import { steps, mealTypes, features } from "./homeData";
import HomeHero from "~/components/HomeHero";
import type { Route } from "./+types/home";

import {
  // Base / gerais
  ChevronRight,
  Star,
  // Steps
  Calendar,
  ClipboardCheck,
  ShieldCheck,
  // Meals
  UtensilsCrossed,
  Coffee,
  Pizza,
  Cake,
  // Features
  BarChart3,
  QrCode,
  Bell,
  Settings,
  // CTA bullets
  Users,
  Clock,
  Lock,
  // Seções
  BookOpen,
  FileText,
  PlayCircle,
} from "lucide-react";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Previsão SISUB" },
    { name: "description", content: "Ajude a melhorar o SISUB" },
  ];
}

export default function Home() {
  const [currentFeature, setCurrentFeature] = useState(0);
  const [isVisible, setIsVisible] = useState({
    hero: false,
    steps: false,
    meals: false,
    features: false,
    cta: false,
    changelog: false,
    tutorial: false,
  });

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          setIsVisible((prev) => ({
            ...prev,
            // Garante que o ID existe antes de setar
            ...(entry.target.id
              ? { [entry.target.id]: entry.isIntersecting }
              : {}),
          }));
        });
      },
      {
        threshold: 0.12,
        rootMargin: "0px 0px -10% 0px",
      }
    );

    document.querySelectorAll<HTMLElement>("[id]").forEach((el) => {
      observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  // Mapas simples de ícones (lucide) por índice
  const StepIcons = useMemo(() => [Calendar, ClipboardCheck, ShieldCheck], []);
  const MealIcons = useMemo(() => [UtensilsCrossed, Coffee, Pizza, Cake], []);
  const FeatureIcons = useMemo(
    () => [BarChart3, QrCode, Bell, Settings, ShieldCheck, Users],
    []
  );

  const CurrentFeatureIcon = FeatureIcons[currentFeature % FeatureIcons.length];

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-blue-50 via-white to-green-50">
      {/* Background decorativo sutil */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-blue-200/40 blur-3xl" />
        <div className="absolute -bottom-24 -left-10 h-72 w-72 rounded-full bg-emerald-200/40 blur-3xl" />
      </div>

      {/* Hero Section */}
      {HomeHero(isVisible)}

      {/* Como Funciona */}
      <div
        id="steps"
        className={`container mx-auto px-4 py-20 transition-all duration-700 ${
          isVisible.steps
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-8"
        }`}
      >
        <div className="text-center mb-14">
          <div className="mx-auto mb-3 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm text-blue-700">
            <Star className="h-4 w-4" />
            Passo a passo
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-gray-900 mb-4">
            Como funciona o sistema
          </h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Um processo simples e eficiente para gerenciar suas previsões de
            refeições
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {steps.map((step, index) => {
            const Icon = StepIcons[index % StepIcons.length];
            return (
              <div
                key={index}
                className={`group relative overflow-hidden rounded-2xl border-2 ${step.color} bg-white p-7 text-center shadow-sm transition-all duration-300 hover:shadow-xl`}
              >
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500/70 via-emerald-500/70 to-blue-500/70" />
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-50 to-emerald-50 ring-1 ring-black/5">
                  <Icon className="h-8 w-8 text-blue-600" />
                </div>
                <h3 className="text-xl font-bold mb-2 text-gray-900">
                  {step.title}
                </h3>
                <p className="text-gray-600">{step.description}</p>
                <div className="pointer-events-none absolute -right-10 -bottom-10 h-28 w-28 rounded-full bg-blue-100/40 blur-2xl transition-all duration-300 group-hover:scale-110" />
              </div>
            );
          })}
        </div>
      </div>

      {/* Tipos de Refeição */}
      <div
        id="meals"
        className={`bg-gradient-to-b from-gray-50 to-white py-20 transition-all duration-700 ${
          isVisible.meals
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-8"
        }`}
      >
        <div className="container mx-auto px-4">
          <div className="text-center mb-14">
            <div className="mx-auto mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm text-emerald-700">
              <UtensilsCrossed className="h-4 w-4" />
              Refeições
            </div>
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-gray-900 mb-4">
              Tipos de refeição disponíveis
            </h2>
            <p className="text-gray-600">
              Marque quais refeições você irá consumir em cada dia
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {mealTypes.map((meal, index) => {
              const Icon = MealIcons[index % MealIcons.length];
              return (
                <div
                  key={index}
                  className="group cursor-pointer rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-gray-900/5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
                >
                  <div
                    className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl ${meal.color} ring-1 ring-black/5`}
                  >
                    <Icon className="h-8 w-8 text-gray-800/80" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {meal.label}
                  </h3>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Features com carrossel */}
      <div
        id="features"
        className={`container mx-auto px-4 py-20 transition-all duration-700 ${
          isVisible.features
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-8"
        }`}
      >
        <div className="text-center mb-14">
          <div className="mx-auto mb-3 inline-flex items-center gap-2 rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-sm text-purple-700">
            <Star className="h-4 w-4" />
            Funcionalidades
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-gray-900 mb-4">
            Principais funcionalidades
          </h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Desenvolvido especificamente para atender as necessidades do rancho
            militar
          </p>
        </div>

        {/* Feature destacada */}
        <div className="max-w-4xl mx-auto mb-8">
          <div className="rounded-2xl p-8 text-white text-center shadow-lg ring-1 ring-black/10 bg-gradient-to-r from-blue-600 via-blue-500 to-emerald-500">
            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <CurrentFeatureIcon className="h-10 w-10 text-white" />
            </div>
            <h3 className="text-2xl font-bold mb-3 drop-shadow-sm">
              {features[currentFeature].title}
            </h3>
            <p className="text-base md:text-lg/relaxed text-white/90">
              {features[currentFeature].description}
            </p>
          </div>
        </div>

        {/* Navegação das features */}
        <div className="flex justify-center gap-2 mb-10">
          {features.map((f, index) => (
            <button
              key={index}
              onClick={() => setCurrentFeature(index)}
              className={`h-3 w-3 rounded-full transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 ${
                index === currentFeature
                  ? "bg-blue-600 scale-125"
                  : "bg-gray-300 hover:bg-gray-400"
              }`}
              title={`Selecionar funcionalidade ${f.title}`}
              aria-label={`Selecionar funcionalidade ${f.title}`}
            />
          ))}
        </div>

        {/* Grid de todas as features */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {features.map((feature, index) => {
            const Icon = FeatureIcons[index % FeatureIcons.length];
            const active = index === currentFeature;
            return (
              <button
                type="button"
                key={index}
                onClick={() => setCurrentFeature(index)}
                className={`group w-full cursor-pointer rounded-2xl bg-white p-6 text-left shadow-sm ring-1 transition-all duration-300 ${
                  active
                    ? "ring-blue-400/60 shadow-lg"
                    : "ring-gray-900/5 hover:-translate-y-1 hover:shadow-xl"
                }`}
                aria-pressed={active}
              >
                <div className="mb-3 flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                      active
                        ? "bg-blue-50 text-blue-600"
                        : "bg-gray-50 text-gray-700"
                    } ring-1 ring-black/5`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3
                    className={`text-lg font-bold ${
                      active ? "text-blue-900" : "text-gray-900"
                    }`}
                  >
                    {feature.title}
                  </h3>
                </div>
                <p className="text-gray-600 text-sm">{feature.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tutorial + Changelog lado a lado */}
      <div id="learn" className="container mx-auto px-4 py-20">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
          {/* Card: Tutorial */}
          <section
            id="tutorial"
            className={`transition-all duration-700 ${
              isVisible.tutorial
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-8"
            }`}
          >
            <div className="flex h-full flex-col items-center rounded-2xl border border-emerald-100 bg-white p-8 text-center shadow-sm ring-1 ring-black/5">
              <div className="mx-auto mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm text-emerald-700">
                <BookOpen className="h-4 w-4" />
                Tutorial
              </div>
              <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-gray-900 mb-3">
                Guia do SISUB
              </h2>
              <p className="text-gray-600 mb-6 max-w-md">
                Aprenda passo a passo a preencher previsões e a fiscalizar com
                QR no SISUB.
              </p>

              {/* Badges */}
              <div className="mb-8 flex flex-wrap items-center justify-center gap-2">
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border bg-blue-50 text-blue-800 border-blue-200">
                  <Users className="h-3.5 w-3.5" />
                  usuário
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border bg-green-50 text-green-800 border-green-200">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  fiscal
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border bg-purple-50 text-purple-800 border-purple-200">
                  <PlayCircle className="h-3.5 w-3.5" />
                  passo a passo
                </span>
              </div>

              <div className="mt-auto">
                <Link
                  to="/tutorial"
                  aria-label="Ver o Tutorial completo"
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-3 font-semibold text-white shadow-lg ring-1 ring-black/5 transition-all duration-200 hover:scale-[1.02] hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                >
                  Ver Tutorial
                  <ChevronRight className="h-5 w-5" />
                </Link>
              </div>
            </div>
          </section>

          {/* Card: Changelog */}
          <section
            id="changelog"
            className={`transition-all duration-700 delay-100 ${
              isVisible.changelog
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-8"
            }`}
          >
            <div className="flex h-full flex-col items-center rounded-2xl border border-blue-100 bg-white p-8 text-center shadow-sm ring-1 ring-black/5">
              <div className="mx-auto mb-3 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm text-blue-700">
                <FileText className="h-4 w-4" />
                Novidades
              </div>
              <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-gray-900 mb-3">
                Novidades do SISUB
              </h2>
              <p className="text-gray-600 mb-6 max-w-md">
                Acompanhe as melhorias, correções e novas funcionalidades em
                tempo real.
              </p>

              {/* Badges */}
              <div className="mb-8 flex flex-wrap items-center justify-center gap-2">
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border bg-green-50 text-green-800 border-green-200">
                  <Star className="h-3.5 w-3.5" />
                  feat
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border bg-red-50 text-red-800 border-red-200">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  fix
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border bg-indigo-50 text-indigo-800 border-indigo-200">
                  <FileText className="h-3.5 w-3.5" />
                  docs
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border bg-yellow-50 text-yellow-800 border-yellow-200">
                  <Clock className="h-3.5 w-3.5" />
                  perf
                </span>
              </div>

              <div className="mt-auto">
                <Link
                  to="/changelog"
                  aria-label="Ver o Changelog completo"
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white shadow-lg ring-1 ring-black/5 transition-all duration-200 hover:scale-[1.02] hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                >
                  Ver Changelog
                  <ChevronRight className="h-5 w-5" />
                </Link>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* CTA Final */}
      <div
        id="cta"
        className={`relative bg-gradient-to-r from-blue-600 to-blue-700 text-white py-20 transition-all duration-700 ${
          isVisible.cta
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-8"
        }`}
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.15),transparent_50%)]" />
        <div className="container relative mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-4">
            Pronto para começar?
          </h2>
          <p className="text-blue-100 text-lg mb-8 max-w-2xl mx-auto">
            Faça parte da modernização do SISUB. Acesse agora e comece a
            planejar suas refeições de forma inteligente.
          </p>

          <Link to="/login" aria-label="Ir para a página de login">
            <span className="inline-flex items-center gap-2 rounded-lg bg-white px-8 py-3 text-lg font-semibold text-blue-700 shadow-lg ring-1 ring-black/5 transition-all duration-200 hover:scale-[1.02] hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-blue-700">
              Fazer Login
              <ChevronRight className="h-5 w-5" />
            </span>
          </Link>

          <div className="mt-10 flex flex-wrap justify-center items-center gap-6 text-blue-100">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              <span className="text-sm">Sistema colaborativo</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              <span className="text-sm">Disponível 24/7</span>
            </div>
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              <span className="text-sm">Dados seguros</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <Footer />
    </div>
  );
}
