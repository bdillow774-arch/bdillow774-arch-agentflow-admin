import AgentFlowBrand from '@/app/_components/agentflow-brand';

export default function BrandLogo({
  variant = 'sidebar',
}: {
  variant?: 'sidebar' | 'login';
}) {
  return (
    <AgentFlowBrand
      priority
      className={variant === 'login' ? 'max-w-[260px]' : 'max-w-[190px]'}
    />
  );
}
