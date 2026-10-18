import ClassicDashboard from './ClassicDashboard';
import { FamilyComputer } from './desktop/FamilyComputer';

export default function App() {
  const classic = new URLSearchParams(window.location.search).get('edition') === 'classic';
  return classic ? <ClassicDashboard /> : <FamilyComputer />;
}
