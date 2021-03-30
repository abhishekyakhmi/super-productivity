import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, ViewChild } from '@angular/core';
import { CalendarOptions, FullCalendarComponent } from '@fullcalendar/angular';
import { Observable, Subscription } from 'rxjs';
import { map, withLatestFrom } from 'rxjs/operators';
import { EventChangeArg, EventClickArg, EventDropArg, EventInput } from '@fullcalendar/common';
import { WorkContextService } from '../work-context/work-context.service';
import { TaskService } from '../tasks/task.service';
import { getWorklogStr } from '../../util/get-work-log-str';
import { Task, TaskWithReminderData } from '../tasks/task.model';
import { msToString } from '../../ui/duration/ms-to-string.pipe';
import { DAY_STARTS_AT } from '../../app.constants';
import { isToday } from '../../util/is-today.util';
import { millisecondsDiffToRemindOption } from '../tasks/util/remind-option-to-milliseconds';
import { WorkContextColorMap } from '../work-context/work-context.model';
import { CALENDAR_MIN_TASK_DURATION, STATIC_CALENDAR_OPTS } from './calendar.const';

const WEIRD_MAGIC_HOUR = 60000 * 60;

@Component({
  // apparently calendar does not work, so we add a prefix
  selector: 'sup-calendar',
  templateUrl: './calendar.component.html',
  styleUrls: ['./calendar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CalendarComponent implements OnDestroy {
  @ViewChild('calendar') calendarEl?: FullCalendarComponent;

  calOptions?: CalendarOptions;

  private DEFAULT_CAL_OPTS: CalendarOptions = {
    ...STATIC_CALENDAR_OPTS,
    eventResize: this._handleResize.bind(this),
    eventDrop: this._handleDrop.bind(this),
    eventClick: (calEvent: EventClickArg) => {
      console.log(calEvent);
    },
    // dateClick: (arg: any) => {
    //   // console.log('I am here!');
    //   // console.log(arg.date.toUTCString()); // use *UTC* methods on the native Date Object
    //   // will output something like 'Sat, 01 Sep 2018 00:00:00 GMT'
    // },
    // eventReceive: (calEvent: any) => {
    //   console.log(calEvent);
    //   // this.openDialog(calEvent);
    // },
    // eventLeave: (calEvent: any) => {
    //   console.log(calEvent);
    //   // this.openDialog(calEvent);
    // },
  };

  calOptions$: Observable<CalendarOptions> = this._taskService.plannedTasks$.pipe(
    withLatestFrom(
      this._workContextService.allWorkContextColors$,
      this._taskService.currentTaskId$,
    ),
    map(this._mapTasksToCalOptions.bind(this))
  );

  private _subs: Subscription = new Subscription();

  constructor(
    private _workContextService: WorkContextService,
    private _taskService: TaskService,
    private _changeDetectorRef: ChangeDetectorRef,
  ) {
    // NOTE: this somehow fixes the duplication issue
    this._subs.add(this.calOptions$.subscribe((v) => {
      this.calOptions = v;
      this._changeDetectorRef.markForCheck();
    }));
  }

  ngOnDestroy() {
    this._subs.unsubscribe();
  }

  // private handleDateClick(arg: any) {
  //   alert('date click! ' + arg.dateStr);
  // }

  private _handleResize(calEvent: EventChangeArg) {
    const start = calEvent.event._instance?.range.start as Date;
    const task: TaskWithReminderData = calEvent.event.extendedProps as TaskWithReminderData;
    // TODO make it work for other days than today
    const TD_STR = getWorklogStr();
    const timeSpentToday: number = task.timeSpentOnDay[TD_STR] || 0;

    this._taskService.reScheduleTask({
      taskId: task.id,
      plannedAt: start.getTime() - WEIRD_MAGIC_HOUR,
      title: task.title,
      reminderId: task.reminderId as string,
      remindCfg: task.reminderData && millisecondsDiffToRemindOption(task.plannedAt as number, task.reminderData.remindAt),
    });

    const timeLeft: number = (task.timeEstimate || 0) - (task.timeSpent || 0);
    const withTimeSpentToday: number = timeLeft + timeSpentToday;
    // const withMinDuration: number = Math.max(task.timeEstimate, CALENDAR_MIN_TASK_DURATION);
    const withDelta: number = withTimeSpentToday + (calEvent as any).endDelta.milliseconds;
    const timeEstimate: number = Math.max(timeSpentToday, withDelta);

    console.log({
      timeEstimate: timeEstimate / 60000,
      timeLeft: timeLeft / 60000,
      withTimeSpentToday: withTimeSpentToday / 60000,
      withDelta: withDelta / 60000,
    });
    // TODO show toast for cannot be smaller than timeSpentToday

    this._taskService.update(task.id, {
      timeEstimate
    });
  }

  private _handleDrop(calEvent: EventDropArg) {
    const task: TaskWithReminderData = calEvent.event.extendedProps as TaskWithReminderData;
    const start = calEvent.event._instance?.range.start as Date;
    console.log(calEvent);

    // TODO understand and fix this
    if (calEvent.event.allDay) {
      if (isToday(start)) {
        this._taskService.unScheduleTask(task.id, task.reminderId as string);
      } else {
        const dayStartsSplit = DAY_STARTS_AT.split(':');
        start.setHours(+dayStartsSplit[0], +dayStartsSplit[1], 0, 0);
        const startTime = start.getTime();
        this._taskService.reScheduleTask({
          taskId: task.id,
          reminderId: task.reminderId as string,
          plannedAt: startTime,
          remindCfg: task.reminderData && millisecondsDiffToRemindOption(task.plannedAt as number, task.reminderData.remindAt),
          title: task.title,
        });
      }
    } else {
      const startTime = start.getTime() - WEIRD_MAGIC_HOUR;
      this._taskService.reScheduleTask({
        taskId: task.id,
        reminderId: task.reminderId as string,
        plannedAt: startTime,
        title: task.title,
        remindCfg: task.reminderData && millisecondsDiffToRemindOption(task.plannedAt as number, task.reminderData.remindAt),
      });
    }
  }

  private _mapTasksToCalOptions([tasks, colorMap, currentTaskId]: [Task[], WorkContextColorMap, string | null]): CalendarOptions {
    // TODO make it work for other days than today
    const TD_STR = getWorklogStr();

    const events: EventInput[] = tasks.map((task: Task): EventInput => {
      const timeSpentToday: number = task.timeSpentOnDay[TD_STR] || 0;
      let timeToGo: number = (task.timeEstimate - task.timeSpent);
      const classNames: string[] = [];
      timeToGo = ((timeToGo + timeSpentToday > (CALENDAR_MIN_TASK_DURATION))
        ? timeToGo
        : CALENDAR_MIN_TASK_DURATION);

      // if (task.title.match(/Something/)) {
      //   console.log({timeToGo: timeToGo / 60000});
      // }

      if (task.isDone) {
        classNames.push('isDone');
      }

      if (task.reminderId) {
        classNames.push('hasAlarm');
      }
      if (task.id === currentTaskId) {
        classNames.push('isCurrent');
      }

      return {
        title: task.title
          + ' '
          + msToString(task.timeSpent)
          + '/'
          + msToString(task.timeEstimate),
        // groupId: task.parentId || undefined,

        extendedProps: task,

        classNames,

        backgroundColor: task.projectId
          ? colorMap[task.projectId]
          : colorMap[task.tagIds[0]],

        ...(task.plannedAt
            ? {
              start: new Date(task.plannedAt),
              end: new Date((task.isDone && task.doneOn)
                ? (task.plannedAt as number) + timeSpentToday
                : (task.plannedAt as number) + timeToGo + timeSpentToday),
            }
            : {
              allDay: true,
              // start: TD_STR,
              duration: 2000000,
              start: Date.now(),
              end: Date.now() + timeToGo
            }
        ),
      };
    });
    // console.log(tasks, events);

    return {
      ...this.DEFAULT_CAL_OPTS,
      events,
    };
  }
}

// events: [{
// title: 'Asd',
// start: new Date(),
// allDay: true,
// backgroundColor: 'red',
// end: new Date()
// display: 'string | null;',
// startEditable: 'boolean | null;',
// durationEditable: 'boolean | null;',
// constraints: 'Constraint[];',
// overlap: 'boolean | null;',
// allows: 'AllowFunc[];',
// backgroundColor: 'string;',
// borderColor: 'string;',
// textColor: 'string;',
// classNames: 'string[];',
// editable: true,
// startEditable: true,
// durationEditable: true,
// }],
