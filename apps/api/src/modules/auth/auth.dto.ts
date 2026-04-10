import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class WxLoginQueryDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  appid!: string;

  @IsString()
  @IsNotEmpty()
  state!: string;

  @IsOptional()
  @IsString()
  @IsIn(['corp', 'csdn'])
  corp?: 'corp' | 'csdn';
}

export class GetStateQueryDto {
  @IsString()
  @IsNotEmpty()
  state!: string;
}
