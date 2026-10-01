import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import {
  CreateSubscriptionPlanDto,
  UpdateSubscriptionPlanDto,
} from "./dto/subscription-plan.dto";

@Injectable()
export class AdminSubscriptionPlansService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSubscriptionPlanDto) {
    const count = await this.prisma.subscriptionPlan.count();
    if (count >= 3) {
      throw new BadRequestException(
        "You can only have up to 3 subscription plans.",
      );
    }
    return this.prisma.subscriptionPlan.create({ data: dto });
  }

  findAll() {
    return this.prisma.subscriptionPlan.findMany({ orderBy: { order: "asc" } });
  }

  async update(id: string, dto: UpdateSubscriptionPlanDto) {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id },
    });
    if (!plan) throw new NotFoundException("Subscription plan not found");
    return this.prisma.subscriptionPlan.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id },
    });
    if (!plan) throw new NotFoundException("Subscription plan not found");
    return this.prisma.subscriptionPlan.delete({ where: { id } });
  }
}
