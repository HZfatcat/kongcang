import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  OpportunityQueryDto,
  UpdateOpportunityStatusDto,
  UpsertOpportunityDto,
} from './opportunity.dto';
import { OpportunityService } from './opportunity.service';
import { parse } from 'csv-parse/sync';

@Controller('opportunities')
export class OpportunityController {
  constructor(private readonly opportunityService: OpportunityService) {}

  @Get()
  list(@Query() query: OpportunityQueryDto) {
    return this.opportunityService.list(query);
  }

  @Get('summary')
  summary(@Query() query: OpportunityQueryDto) {
    return this.opportunityService.summary(query.startDate, query.endDate);
  }

  @Post('upsert')
  upsert(@Body() payload: UpsertOpportunityDto) {
    return this.opportunityService.upsert(payload);
  }

  @Post(':id/status')
  updateStatus(@Param('id') id: string, @Body() payload: UpdateOpportunityStatusDto) {
    return this.opportunityService.updateStatus(id, payload);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.opportunityService.remove(id);
  }

  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  async importCsv(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('请上传文件');
    }

    const content = file.buffer.toString('utf-8');
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];

    if (!Array.isArray(records) || records.length === 0) {
      throw new BadRequestException('CSV 文件为空或格式不正确');
    }

    return this.opportunityService.importFromCsv(records);
  }
}
