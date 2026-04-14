import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { UpsertWecomEmployeeDto } from './wecom-employee.dto';

@Injectable()
export class WecomEmployeeService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.wecomEmployee.findMany({
      orderBy: [{ enabled: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  get(userId: string) {
    return this.prisma.wecomEmployee.findUnique({
      where: { userId },
    });
  }

  upsert(payload: UpsertWecomEmployeeDto) {
    return this.prisma.wecomEmployee.upsert({
      where: { userId: payload.userId },
      create: {
        userId: payload.userId,
        name: payload.name,
        department: payload.department,
        position: payload.position,
        mobile: payload.mobile,
        email: payload.email,
        avatar: payload.avatar,
        enabled: payload.enabled ?? true,
        isCustomerService: payload.isCustomerService ?? false,
        remark: payload.remark,
      },
      update: {
        name: payload.name,
        department: payload.department,
        position: payload.position,
        mobile: payload.mobile,
        email: payload.email,
        avatar: payload.avatar,
        enabled: payload.enabled ?? true,
        isCustomerService: payload.isCustomerService ?? false,
        remark: payload.remark,
      },
    });
  }

  remove(userId: string) {
    return this.prisma.wecomEmployee.delete({
      where: { userId },
    });
  }
}
