// components/SimplifiedMilitaryStatsSkeleton.tsx
import { CalendarDays, Utensils, Clock } from "lucide-react";
import { Card, CardContent } from "@iefa/ui";
import { Skeleton } from "@iefa/ui";

const SimplifiedMilitaryStatsSkeleton = () => {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Próxima Refeição Skeleton */}
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-4">
            <div className="flex items-center space-x-3">
              <Utensils className="h-5 w-5 text-green-600" />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-600">
                  Próxima Refeição
                </p>
                <Skeleton className="h-6 w-20 mt-1" />
                <Skeleton className="h-4 w-16 mt-1" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Próximos 7 Dias Skeleton */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-3">
              <Clock className="h-5 w-5 text-blue-600" />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-600">
                  Próximos 7 Dias
                </p>
                <Skeleton className="h-6 w-24 mt-1" />
                <Skeleton className="h-4 w-16 mt-1" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Status Geral Skeleton */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-3">
              <CalendarDays className="h-5 w-5 text-purple-600" />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-600">Status</p>
                <Skeleton className="h-6 w-32 mt-1 rounded-full" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SimplifiedMilitaryStatsSkeleton;
