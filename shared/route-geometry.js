export function calculateDistanceKm(segments) {
  const earthRadiusKm = 6371.0088;
  let distanceKm = 0;
  for (const segment of segments) {
    for (let index = 1; index < segment.length; index += 1) {
      const [latitude1, longitude1] = segment[index - 1];
      const [latitude2, longitude2] = segment[index];
      const latitudeDelta = (latitude2 - latitude1) * Math.PI / 180;
      const longitudeDelta = (longitude2 - longitude1) * Math.PI / 180;
      const haversine =
        Math.sin(latitudeDelta / 2) ** 2 +
        Math.cos(latitude1 * Math.PI / 180) *
          Math.cos(latitude2 * Math.PI / 180) *
          Math.sin(longitudeDelta / 2) ** 2;
      distanceKm += 2 * earthRadiusKm * Math.asin(Math.sqrt(haversine));
    }
  }
  return distanceKm;
}
