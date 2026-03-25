import { useMemo } from 'react';
import { getUserTimezone, getTimezoneLabel } from '@/lib/timezone';
import { TEACHER_TIMEZONE } from '@/lib/constants';

export function useUserTimezone() {
  const userTz = useMemo(() => getUserTimezone(), []);
  const userTzLabel = useMemo(() => getTimezoneLabel(userTz), [userTz]);
  const teacherTzLabel = useMemo(() => getTimezoneLabel(TEACHER_TIMEZONE), []);
  const isSameAsTeacher = useMemo(() => userTz === TEACHER_TIMEZONE, [userTz]);

  return { userTz, userTzLabel, teacherTzLabel, isSameAsTeacher };
}
