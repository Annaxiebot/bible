import React from 'react';

interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  maxWidth?: string;
  zIndex?: string;
}

export const Dialog: React.FC<DialogProps> = ({
  isOpen,
  onClose,
  title,
  children,
  actions,
  maxWidth = 'max-w-sm',
  zIndex = 'z-[70]',
}) => {
  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 ${zIndex} flex items-center justify-center bg-black/50`}
      onClick={onClose}
    >
      <div
        className={`bg-white rounded-xl shadow-2xl ${maxWidth} w-[90%] overflow-hidden`}
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-4">
          <h3 className="text-white font-bold text-base">{title}</h3>
        </div>
        <div className="p-5">{children}</div>
        {actions && (
          <div className="flex gap-2 px-5 py-4 border-t border-gray-100">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
};
