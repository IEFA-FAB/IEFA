import { memo } from "react";
import { CheckCircle, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@iefa/ui";
import { Button } from "@iefa/ui";

interface AlertMessagesProps {
  success?: string | null;
  error?: string | null;
  onClearMessages: () => void;
}

export const AlertMessages = memo<AlertMessagesProps>(
  ({ success, error, onClearMessages }) => {
    if (!success && !error) return null;

    return (
      <div>
        {success && (
          <Alert className="border-green-200 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              {success}
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              {error}
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearMessages}
                className="cursor-pointer"
              >
                ✕
              </Button>
            </AlertDescription>
          </Alert>
        )}
      </div>
    );
  }
);

AlertMessages.displayName = "AlertMessages";
