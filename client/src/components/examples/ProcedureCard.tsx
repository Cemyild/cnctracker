import { ProcedureCard } from '../ProcedureCard';

export default function ProcedureCardExample() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <ProcedureCard title="Active Procedures" count={7} variant="default" />
      <ProcedureCard title="Pending Documents" count={11} variant="blue" />
      <ProcedureCard title="Awaiting Payment" count={13} variant="yellow" />
    </div>
  );
}
