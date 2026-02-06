export interface ApiResponse<T> {
    success: boolean;
    message: string;
    data?: T;
    error?: string;
}

export class ApiResponseHandler {

    // Success response handler
    static success<T>(message: string, data?: T): ApiResponse<T> {
        return {
            success: true,
            message,
            data,
        };
    }

    // Error response handler
    static error<T>(message: string, error?: string): ApiResponse<T> {
        return {
            success: false,
            message,
            error,
        };
    }

    // Custom response handler (for cases where you may need a custom format)
    static custom<T>(success: boolean, message: string, data?: T, error?: string): ApiResponse<T> {
        return {
            success,
            message,
            data,
            error,
        };
    }
}
