import { Empty } from "../components/Empty";
import { setView } from "../stores/ui";

export function Gate() {
  return <Placeholder title="Gate (Screener)" milestone="M1" />;
}
export function Stream() {
  return <Placeholder title="Stream" milestone="M1" />;
}
export function Records() {
  return <Placeholder title="Records" milestone="M1" />;
}
export function Trash() {
  return <Placeholder title="Trash" milestone="M1" />;
}
export function Spam() {
  return <Placeholder title="Spam" milestone="M1" />;
}
export function Contacts() {
  return <Placeholder title="Contacts" milestone="M5" />;
}
export function Companies() {
  return <Placeholder title="Companies" milestone="M5" />;
}
export function Calendar() {
  return <Placeholder title="Calendar" milestone="M5" />;
}
export function Files() {
  return <Placeholder title="Files" milestone="M5" />;
}
export function Insights() {
  return <Placeholder title="Insights" milestone="M5" />;
}
export function Drafts() {
  return <Placeholder title="Drafts" milestone="M3" />;
}
export function FollowUps() {
  return <Placeholder title="Follow-ups" milestone="M3" />;
}
export function Clips() {
  return <Placeholder title="Clips" milestone="M3" />;
}
export function Search() {
  return <Placeholder title="Search" milestone="M4" />;
}
export function Settings() {
  return <Placeholder title="Settings" milestone="M7" />;
}

function Placeholder(props: { title: string; milestone: string }) {
  return (
    <div style={{ padding: "var(--space-5)" }}>
      <Empty
        icon="ph-hammer"
        title={props.title}
        description={`预计 ${props.milestone} 实装`}
        action={{ label: "返回 Imbox", onClick: () => setView("imbox") }}
      />
    </div>
  );
}