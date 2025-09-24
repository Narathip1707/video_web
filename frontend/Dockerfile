# Use minimal Nginx Alpine
FROM nginx:alpine

# Copy HTML file
COPY index.html /usr/share/nginx/html/

# Copy custom nginx config if needed
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]