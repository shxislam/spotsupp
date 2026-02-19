
import React from 'react';

interface SocialButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
}

const SocialButton: React.FC<SocialButtonProps> = ({ icon, label, onClick }) => {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between border border-[#878787] rounded-full px-8 py-3 mb-2 hover:border-white transition-all group"
    >
      <div className="w-6 h-6 flex items-center justify-center">
        {icon}
      </div>
      <span className="flex-1 text-center font-bold text-white text-[14px]">
        {label}
      </span>
      <div className="w-6" /> {/* Spacer for centering */}
    </button>
  );
};

export default SocialButton;
