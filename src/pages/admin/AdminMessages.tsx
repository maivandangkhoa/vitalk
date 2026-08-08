import { ChatShell } from '@/components/chat/ChatShell';
import { useAuthStore } from '@/stores/authStore';

/**
 * Teachers answer their own students here. An admin gets the monitor instead:
 * every conversation, always read-only — including the rare thread they are a
 * party to, which they answer from `/messages` like any other student. Sending
 * from a page whose whole purpose is watching other people would be a slip
 * waiting to happen, so the composer is simply never here.
 */
export default function AdminMessages() {
  const { role } = useAuthStore();

  return <ChatShell basePath="/admin/messages" monitor={role === 'admin'} />;
}
