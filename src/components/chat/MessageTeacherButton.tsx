import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { inboxPathFor, openConversation } from '@/lib/chat';
import { useAuthStore } from '@/stores/authStore';
import type { TeacherProfile } from '@/types';

interface Props {
  teacher: Pick<TeacherProfile, 'id' | 'name' | 'profileImageUrl'>;
  className?: string;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'sm' | 'default' | 'lg';
}

/**
 * Opens (or reopens) the chat with this teacher. The conversation id is derived
 * from the pair, so clicking twice can never produce two threads.
 */
export function MessageTeacherButton({
  teacher,
  className,
  variant = 'outline',
  size = 'default',
}: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, role } = useAuthStore();
  const [busy, setBusy] = useState(false);

  // A teacher looking at their own profile has nobody to message.
  if (user && user.uid === teacher.id) return null;

  const handleClick = async () => {
    if (!user) {
      navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`);
      return;
    }

    setBusy(true);
    try {
      const id = await openConversation({
        studentId: user.uid,
        studentName: user.displayName || user.email?.split('@')[0] || 'Student',
        studentPhoto: user.photoURL || '',
        teacher,
      });
      navigate(`${inboxPathFor(role)}/${id}`);
    } catch (err) {
      console.error('openConversation error', err);
      toast.error(t('chat.openFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      disabled={busy}
      onClick={handleClick}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <MessageCircle className="h-4 w-4" />
      )}
      {t('chat.messageTeacher')}
    </Button>
  );
}
