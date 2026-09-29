import Image from 'next/image';

type AgentFlowBrandProps = {
  className?: string;
  priority?: boolean;
  compact?: boolean;
};

export default function AgentFlowBrand({
  className = '',
  priority = false,
  compact = false,
}: AgentFlowBrandProps) {
  return (
    <Image
      src={compact ? '/agentflow-icon.svg' : '/agentflow-logo.svg'}
      alt="AgentFlow"
      width={compact ? 56 : 245}
      height={compact ? 56 : 60}
      priority={priority}
      className={['h-auto w-auto', className].filter(Boolean).join(' ')}
    />
  );
}
