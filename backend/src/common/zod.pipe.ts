import {
  ArgumentMetadata,
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  PipeTransform,
} from "@nestjs/common";
import { ZodType } from "zod";

/**
 * Validates a request body/query against a zod schema and replaces the value
 * with the parsed (typed, stripped) result.
 */
@Injectable()
export class ZodPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        error: "ValidationFailed",
        message: "Request validation failed",
        code: "VALIDATION_FAILED",
        details: result.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      });
    }
    return result.data;
  }
}

export function zodPipe<T>(schema: ZodType<T>): ZodPipe<T> {
  return new ZodPipe(schema);
}

export function assertOrThrow(condition: unknown, e: HttpException): void {
  if (!condition) throw e;
}
