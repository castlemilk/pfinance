output "service_url" {
  value       = google_cloud_run_service.backend.status[0].url
  description = "The URL of the deployed Cloud Run service"
}
