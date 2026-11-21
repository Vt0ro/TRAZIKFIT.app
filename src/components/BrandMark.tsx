interface BrandMarkProps {
  className?: string;
}

export function BrandMark({ className = 'w-10 h-10' }: BrandMarkProps) {
  return (
    <img
      src="/brand/logo/trazikfit-mark.png"
      alt="TrazikFit"
      draggable={false}
      className={`object-contain select-none ${className}`}
    />
  );
}

export function BrandWordmark({ className = 'text-2xl' }: { className?: string }) {
  return <span className={`tf-wordmark inline-block ${className}`}>TrazikFit</span>;
}

export function BrandSlogan({ className = 'text-[10px]' }: { className?: string }) {
  return (
    <p className={`tf-slogan text-[#CFC8DD] ${className}`}>
      PLANIFICA • REGISTRA • EVOLUCIONA
    </p>
  );
}
