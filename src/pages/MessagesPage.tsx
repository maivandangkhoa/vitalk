import { ChatShell } from '@/components/chat/ChatShell';

export default function MessagesPage() {
  return (
    <div className="container mx-auto px-4 py-6">
      <ChatShell basePath="/messages" />
    </div>
  );
}
