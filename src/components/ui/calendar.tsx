import { DayPicker } from 'react-day-picker';
import { pt } from 'date-fns/locale';
import { cn } from '@/lib/cn';
import 'react-day-picker/style.css';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

export function Calendar({ className, ...props }: CalendarProps) {
  return (
    <DayPicker
      locale={pt}
      weekStartsOn={1}
      className={cn('p-3', className)}
      {...props}
    />
  );
}
