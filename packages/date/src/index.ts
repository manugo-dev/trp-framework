import dayjs, { Dayjs } from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { UnitType } from 'dayjs';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

export type DateInput = string | number | Date | Dayjs | undefined;

export class DateWrapper {
  private _date: Dayjs;

  constructor(input?: DateInput, format?: string, tz?: string) {
    if (format) {
      this._date = dayjs(input, format);
    } else {
      this._date = dayjs(input);
    }
    if (tz) {
      this._date = this._date.tz(tz);
    }
  }

  static now(tz?: string): DateWrapper {
    return new DateWrapper(undefined, undefined, tz);
  }

  static from(input: DateInput, format?: string, tz?: string): DateWrapper {
    return new DateWrapper(input, format, tz);
  }

  toDate(): Date {
    return this._date.toDate();
  }

  toISOString(): string {
    return this._date.toISOString();
  }

  format(fmt: string): string {
    return this._date.format(fmt);
  }

  add(value: number, unit: dayjs.ManipulateType): DateWrapper {
    return new DateWrapper(this._date.add(value, unit));
  }

  subtract(value: number, unit: dayjs.ManipulateType): DateWrapper {
    return new DateWrapper(this._date.subtract(value, unit));
  }

  diff(date: DateInput, unit?: UnitType, float?: boolean): number {
    return this._date.diff(dayjs(date), unit, float);
  }

  isBefore(date: DateInput, unit?: UnitType): boolean {
    return this._date.isBefore(dayjs(date), unit);
  }

  isAfter(date: DateInput, unit?: UnitType): boolean {
    return this._date.isAfter(dayjs(date), unit);
  }

  isSame(date: DateInput, unit?: UnitType): boolean {
    return this._date.isSame(dayjs(date), unit);
  }

  clone(): DateWrapper {
    return new DateWrapper(this._date);
  }

  set(unit: UnitType, value: number): DateWrapper {
    return new DateWrapper(this._date.set(unit, value));
  }

  get(unit: UnitType): number {
    return this._date.get(unit);
  }

  toUnix(): number {
    return this._date.unix();
  }

  toJSON(): string {
    return this._date.toJSON();
  }

  toString(): string {
    return this._date.toString();
  }
}

// Example usage:
// const date = DateWrapper.now().add(1, 'day').format('YYYY-MM-DD');
