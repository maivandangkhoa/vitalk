import { ChatShell } from '@/components/chat/ChatShell';
import { useAuthStore } from '@/stores/authStore';

/**
 * Teachers answer their own students here. An admin sees every conversation
 * but is never a participant, so the composer stays hidden — the rules enforce
 * the same thing server-side.
 */
export default function AdminMessages() {
  const { role } = useAuthStore();

  return <ChatShell basePath="/admin/messages" monitor={role === 'admin'} />;
}
