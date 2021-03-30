import { ChangeDetectionStrategy, Component, ViewChild } from '@angular/core';
import { CalendarOptions, EventClickArg, FullCalendarComponent } from '@fullcalendar/angular';
import { ScheduledTaskService } from '../tasks/scheduled-task.service';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { EventInput } from '@fullcalendar/common';

@Component({
  // apparently calendar does not work, so we add a prefix
  selector: 'sup-calendar',
  templateUrl: './calendar.component.html',
  styleUrls: ['./calendar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CalendarComponent {
  @ViewChild('calendar') calendarEl?: FullCalendarComponent;

  private DEFAULT_CAL_OPTS: CalendarOptions = {
    editable: true,
    eventClick: (calEvent: EventClickArg) => {
      console.log(calEvent);
      // this.openDialog(calEvent);
    },
    events: [],
    headerToolbar: {
      start: 'today prev,next',
      center: 'title',
      end: 'timeGridDay,timeGridWeek,dayGridMonth'
    },
    initialView: 'timeGridDay',
    // dateClick: this.handleDateClick.bind(this), // bind is important!
    // events: [{
    //   title: 'Asd',
    //   start: new Date(),
    //   allDay: true,
    //   backgroundColor: 'red',
    //   // end: new Date()
    //   // display: 'string | null;',
    //   // startEditable: 'boolean | null;',
    //   // durationEditable: 'boolean | null;',
    //   // constraints: 'Constraint[];',
    //   // overlap: 'boolean | null;',
    //   // allows: 'AllowFunc[];',
    //   // backgroundColor: 'string;',
    //   // borderColor: 'string;',
    //   // textColor: 'string;',
    //   // classNames: 'string[];',
    // }],
  };

  calOptions$: Observable<CalendarOptions> = this._scheduledTaskService.allScheduledTasks$.pipe(
    map((tasks): CalendarOptions => {
      const events: EventInput[] = tasks.map((task) => ({
        title: task.title,
        start: task.reminderData.remindAt,
        editable: true,
        startEditable: true,
      }));
      return {
        ...this.DEFAULT_CAL_OPTS,
        events,
      };
    })
  );

  constructor(
    private _scheduledTaskService: ScheduledTaskService,
  ) {
    this.calOptions$.subscribe((v) => console.log('calOptions$', v));
  }

  // private handleDateClick(arg: any) {
  //   alert('date click! ' + arg.dateStr);
  // }
}
