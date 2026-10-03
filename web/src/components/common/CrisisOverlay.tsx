import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HeartHandshake, PhoneCall, X } from 'lucide-react';
import { useBoothStore } from '../../store/boothStore';

export interface CrisisOverlayProps {
  onClose?: () => void;
  onEndCall?: () => void;
}

export const CrisisOverlay: React.FC<CrisisOverlayProps> = ({ onClose, onEndCall }) => {
  const { isCrisisOverlayOpen, setCrisisOverlayOpen } = useBoothStore();

  if (!isCrisisOverlayOpen) return null;

  const handleClose = () => {
    console.info('[CrisisOverlay] 来访者已知晓并主动关闭紧急生命支持浮层');
    setCrisisOverlayOpen(false);
    onEndCall?.();
    onClose?.();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('rethink:crisis:end_call'));
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md select-none">
        <motion.div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="crisis-dialog-title"
          aria-describedby="crisis-dialog-desc"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="w-full max-w-md bg-white rounded-2xl border-2 border-red-500 p-6 shadow-2xl relative text-black"
        >
          <button
            onClick={handleClose}
            aria-label="关闭生命支持提示"
            className="absolute top-4 right-4 p-1 text-neutral-400 hover:text-black transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3 text-red-600 mb-4">
            <HeartHandshake className="w-8 h-8" />
            <h2 id="crisis-dialog-title" className="text-lg font-bold tracking-wide">
              生命支持与紧急关怀
            </h2>
          </div>

          <p
            id="crisis-dialog-desc"
            className="text-xs md:text-sm text-neutral-700 leading-relaxed mb-6 font-light"
          >
            我们非常在乎您的生命安全与身心健康。当感觉痛苦超负荷时，请不要独自承受，专业的心理危机援助人员随时在此倾听与支持您：
          </p>

          <div className="space-y-3 font-mono text-xs mb-6">
            <div className="p-3 rounded-xl border border-red-200 bg-red-50/50 flex items-center justify-between">
              <div>
                <div className="font-semibold text-red-900">全国希望24小时生命危机干预热线</div>
                <div className="text-[11px] text-red-700">24小时免费专业咨询</div>
              </div>
              <a
                href="tel:400-161-9995"
                className="px-3 py-1.5 rounded-lg bg-red-600 text-white font-medium flex items-center gap-1 text-xs"
              >
                <PhoneCall className="w-3.5 h-3.5" />
                <span>400-161-9995</span>
              </a>
            </div>

            <div className="p-3 rounded-xl border border-neutral-200 bg-neutral-50 flex items-center justify-between">
              <div>
                <div className="font-semibold text-neutral-900">北京心理危机研究与干预中心</div>
                <div className="text-[11px] text-neutral-600">全国公立专业心理援助</div>
              </div>
              <a
                href="tel:010-82951332"
                className="px-3 py-1.5 rounded-lg border border-neutral-300 bg-white text-neutral-800 font-medium flex items-center gap-1 text-xs"
              >
                <PhoneCall className="w-3.5 h-3.5" />
                <span>010-82951332</span>
              </a>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="w-full py-2.5 rounded-xl border border-black/20 text-xs font-mono tracking-wider hover:bg-neutral-100 transition-colors"
          >
            我已知晓，返回待机界面
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
