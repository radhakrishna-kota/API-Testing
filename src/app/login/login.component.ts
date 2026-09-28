import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';
import { ToastService } from '../toast.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent {
  username: string = '';
  password: string = '';
  defaultUsername: string = '';
  defaultPassword: string = '';
  isLoading: boolean = false;

  constructor(
    private authService: AuthService,
    private router: Router,
    private toastService: ToastService
  ) {
    this.defaultUsername = this.authService.getDefaultUsername();
    this.defaultPassword = this.authService.getDefaultPassword();
    this.password = this.defaultPassword;
  }

  login(): void {
    this.isLoading = true;

    // Simulate API call delay
    setTimeout(() => {
      if (this.authService.login(this.username, this.password)) {
        this.toastService.show('Login successful.', 'success', 2200);
        this.router.navigate(['/home']);
      } else {
        this.toastService.show('Invalid username or password.', 'error', 2800);
      }
      this.isLoading = false;
    }, 500);
  }

  onKeyPress(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.login();
    }
  }
}
