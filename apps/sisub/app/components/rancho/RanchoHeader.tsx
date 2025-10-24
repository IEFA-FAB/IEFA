import { Button } from "@iefa/ui";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogCancel,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@iefa/ui";
import { LogOut, User, Home, QrCode, X } from "lucide-react";
import { useState, useEffect, type JSX } from "react";
import { checkUserLevel, UserLevelOrNull } from "../UserLevel/AdminService";
import { AuthContextType } from "@iefa/auth";
import { QRCodeCanvas } from "qrcode.react"; // novo import
import RouteSelector from "../routeSelector";

interface RanchoHeaderProps {
  user: AuthContextType["user"];
  signOut: () => Promise<JSX.Element> | Promise<void>;
}

export default function RanchoHeader({ user, signOut }: RanchoHeaderProps) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);
  const [userLevel, setUserLevel] = useState<UserLevelOrNull>(null);

  useEffect(() => {
    const fetchUserLevel = async () => {
      if (user?.id) {
        const level = await checkUserLevel(user.id);
        setUserLevel(level);
      }
    };
    fetchUserLevel();
  }, [user]);

  // Detecta a rota atual

  // Tamanho do QR Code baseado na tela
  const getQRSize = () => {
    if (!isClient) return 180;
    const width = window.innerWidth;
    if (width < 400) return 140;
    if (width < 640) return 160;
    return 180;
  };

  return (
    <header className="bg-white shadow-lg border-b border-gray-200 sticky top-0 z-50 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <a href="/" className="flex items-center space-x-3 cursor-pointer">
            {isClient && window.innerWidth >= 640 && (
              <div className="p-2 bg-blue-50 rounded-lg">
                <Home className="h-5 w-5 text-blue-600" />
              </div>
            )}
            <h1 className="text-2xl sm:text-3xl font-black text-blue-600 k2d-extrabold tracking-tight">
              SISUB
            </h1>
          </a>

          {/* Ações do usuário */}
          <div className="flex items-center space-x-2 sm:space-x-4">
            {/* Toggle entre Previsão e Fiscal (somente admins) */}
            <RouteSelector userLevel={userLevel} />
            {/* Info do usuário */}
            <div className="hidden sm:flex items-center space-x-2 text-sm text-gray-700 bg-gray-50 px-3 py-2 rounded-full border">
              <div className="p-1 bg-white rounded-full">
                <User className="h-3 w-3 text-gray-600" />
              </div>
              <span className="font-medium max-w-32 truncate">
                {user?.email}
              </span>
            </div>
            {/* Dialog do QR do usuário */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center space-x-2 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-all duration-200 shadow-sm cursor-pointer"
                >
                  <QrCode className="h-4 w-4" />
                  {isClient && window.innerWidth >= 640 && (
                    <span className="font-medium">QR</span>
                  )}
                </Button>
              </AlertDialogTrigger>

              <AlertDialogContent className="w-[95vw] max-w-md mx-auto p-0 overflow-hidden">
                <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 sm:px-6 py-3 sm:py-4 text-white relative">
                  <AlertDialogCancel className="absolute top-2 sm:top-4 right-2 sm:right-4 h-7 w-7 sm:h-8 sm:w-8 p-0 bg-white/20 hover:bg-white/30 border-0 text-white rounded-full transition-colors">
                    <X className="h-3 w-3 sm:h-4 sm:w-4" />
                  </AlertDialogCancel>

                  <AlertDialogHeader className="text-left pr-8 sm:pr-12">
                    <AlertDialogTitle className="text-lg sm:text-xl font-bold flex items-center space-x-2">
                      <div className="p-1.5 sm:p-2 bg-white/20 rounded-lg">
                        <QrCode className="h-4 w-4 sm:h-5 sm:w-5" />
                      </div>
                      <span>Seu QR Code</span>
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-blue-100 mt-1 sm:mt-2 text-sm">
                      Use este código para identificação rápida no sistema
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                </div>

                <div className="px-3 sm:px-6 py-4 sm:py-8 bg-gray-50">
                  <div className="flex flex-col items-center space-y-3 sm:space-y-4">
                    <div className="bg-white p-3 sm:p-6 rounded-xl sm:rounded-2xl shadow-lg border-2 sm:border-4 border-gray-100 relative w-fit">
                      <QRCodeCanvas
                        value={user?.id || ""}
                        size={getQRSize()}
                        level="M"
                        bgColor="#ffffff"
                        fgColor="#1f2937"
                      />
                    </div>

                    <div className="text-center space-y-2 w-full max-w-xs sm:max-w-sm">
                      <p className="text-xs sm:text-sm font-medium text-gray-600">
                        ID do Usuário
                      </p>
                      <div className="bg-white px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg border font-mono text-xs text-gray-800 w-full overflow-hidden">
                        <span className="block truncate text-center">
                          {user?.id || "N/A"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </AlertDialogContent>
            </AlertDialog>
            {/* Sair */}
            <Button
              variant="outline"
              size="sm"
              onClick={signOut}
              className="flex items-center space-x-2 hover:bg-red-50 hover:border-red-300 hover:text-red-700 transition-all duration-200 shadow-sm cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
              {isClient && window.innerWidth >= 640 && (
                <span className="font-medium">Sair</span>
              )}
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
