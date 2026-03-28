import { useMemo } from 'react';
import { getUserTimezone, getTimezoneLabel } from '@/lib/timezone';
import { DEFAULT_TIMEZONE } from '@/lib/constants';

export function useUserTimezone(teacherTz: string = DEFAULT_TIMEZONE) {
  const userTz = useMemo(() => getUserTimezone(), []);
  const userTzLabel = useMemo(() => getTimezoneLabel(userTz), [userTz]);
  const teacherTzLabel = useMemo(() => getTimezoneLabel(teacherTz), [teacherTz]);
  const isSameAsTeacher = useMemo(() => userTz === teacherTz, [userTz, teacherTz]);

  return { userTz, userTzLabel, teacherTzLabel, isSameAsTeacher };
}
