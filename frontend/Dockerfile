# Use minimal Nginx Alpine
FROM nginx:alpine

# Copy all HTML files
COPY *.html /usr/share/nginx/html/
COPY favicon.ico /usr/share/nginx/html/

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]