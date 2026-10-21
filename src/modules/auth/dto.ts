import { IsEmail, IsNotEmpty, IsString, Length, MaxLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(8, 128)
  password: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;
}

export class EmailDto {
  @IsEmail()
  email: string;
}

export class TokenDto {
  @IsString()
  @Length(32, 256)
  token: string;
}

export class ResetPasswordDto extends TokenDto {
  @IsString()
  @Length(8, 128)
  newPassword: string;
}
