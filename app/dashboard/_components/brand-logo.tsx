import Image from 'next/image';

export default function BrandLogo({
  variant = 'sidebar',
}: {
  variant?: 'sidebar' | 'login';
}) {
  const iconSize = variant === 'login' ? 78 : 54;
  const textSize =
    variant === 'login'
      ? 'text-[48px] tracking-[-0.06em]'
      : 'text-[32px] tracking-[-0.06em]';

  return (
    <div className="flex items-center gap-3">
      <Image
        src="/agentflow-icon.svg"
        alt="AgentFlow"
        width={iconSize}
        height={iconSize}
        className="h-auto shrink-0"
        priority
      />
      <span
        className={`font-black leading-none text-slate-700 ${textSize}`}
        style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
      >
        AgentFlow
      </span>
    </div>
  );
}
