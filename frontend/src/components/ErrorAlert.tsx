import React from 'react';
import { WifiOff, ServerCrash, RefreshCw } from 'lucide-react';

interface ErrorAlertProps {
  status: string;
  message: string;
  onRetry?: () => void;
}

export const ErrorAlert: React.FC<ErrorAlertProps> = ({ status, message, onRetry }) => {
  const isNetwork = status === 'NETWORK_ERROR';

  return (
    <div className="p-4 sm:p-5 rounded-xl bg-[#FDF1F0] border border-[#F3C7C3] shadow-xs space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded bg-white text-[#C85C52] border border-[#F3C7C3] shrink-0">
            {isNetwork ? <WifiOff className="w-5 h-5" /> : <ServerCrash className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-bold text-[#C85C52] uppercase tracking-wider">
                {isNetwork ? 'Backend Service Unreachable' : 'Scheduling API Error'}
              </h4>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-white text-[#C85C52] border border-[#F3C7C3]">
                {status}
              </span>
            </div>
            <p className="text-xs text-[#68736E] mt-1 leading-relaxed">{message}</p>
          </div>
        </div>

        {onRetry && (
          <button
            onClick={onRetry}
            className="px-3.5 py-1.5 rounded bg-white hover:bg-[#FDF1F0] text-[#17211D] border border-[#F3C7C3] text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors shadow-2xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        )}
      </div>
    </div>
  );
};
