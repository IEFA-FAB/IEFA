import { Link } from "react-router";

export default function HomeHero(isVisible: {
  hero: boolean;
  steps: boolean;
  meals: boolean;
  features: boolean;
  cta: boolean;
}) {
  return (
    <div
      id="hero"
      className={`container mx-auto px-4 py-16 transition-all duration-500 ${
        isVisible.hero
          ? "opacity-100 translate-y-0"
          : "opacity-0 translate-y-10"
      }`}
    >
      <div className="text-center space-y-6 max-w-4xl mx-auto">
        <div className="flex justify-center">
          <span className="bg-blue-100 text-blue-800 px-4 py-2 text-sm font-medium rounded-full animate-pulse">
            Sistema de Previsão de Rancho
          </span>
        </div>

        <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-gray-900 leading-tight">
          Sistema de
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-green-600 block animate-pulse">
            Subsistência
          </span>
        </h1>

        <p className="text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
          Sistema inteligente para previsão de demanda do rancho. Planeje suas
          refeições, reduza desperdícios e otimize a gestão alimentar.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-6">
          <Link to="/login">
            <button className="bg-gradient-to-r cursor-pointer from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-8 py-3 text-lg font-semibold rounded-lg transition-all duration-150 transform hover:scale-105 shadow-lg hover:shadow-xl">
              Acessar Sistema →
            </button>
          </Link>

          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <span className="text-green-500">🛡️</span>
            <span>Login seguro necessário</span>
          </div>
        </div>
      </div>
    </div>
  );
}
