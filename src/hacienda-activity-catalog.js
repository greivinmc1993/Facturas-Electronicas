/**
 * FacturaCR v0.6.72 — índice LOCAL ampliado a partir del listado de TRIBU-CR.
 * Sigue siendo un extracto, NO el catálogo completo ni el padrón tributario.
 * Los códigos y descripciones de este extracto se tomaron de la tabla publicada
 * por el Ministerio de Hacienda: correspondencia ATV (CIIU3) / TRIBU-CR (CIIU4).
 * Fuente: https://www.hacienda.go.cr/ClasificacionActividadesEconomicas.html
 * Documento: https://www.hacienda.go.cr/docs/CorrespondenciaATVCIIU3-TRIBUCRCIIU4-Completo.pdf
 * IMPORTANTE: estar aquí no significa estar inscrito en el RUT de una empresa.
 * Este índice NO se usa para validar el XML ni para inferir una actividad inscrita.
 */
export const HACIENDA_ACTIVITY_SOURCE='https://www.hacienda.go.cr/ClasificacionActividadesEconomicas.html';
export const HACIENDA_ACTIVITY_PDF='https://www.hacienda.go.cr/docs/CorrespondenciaATVCIIU3-TRIBUCRCIIU4-Completo.pdf';
const SAMPLE=`0114.0|Cultivo de caña de azúcar
0115.0|Cultivo de tabaco
0116.0|Cultivo de plantas de fibras
0119.1|Cultivo de flores
0122.1|Cultivo de banano
0122.3|Cultivo de piña
0122.9|Cultivo de otras frutas tropicales y subtropicales
0125.0|Cultivo de otros frutos y nueces de árboles y arbustos
0126.1|Cultivo de palma africana (aceitera)
0127.1|Cultivo de café
0128.0|Cultivo de especies de plantas aromáticas, medicinales y farmacéuticas
0141.1|Cría de ganado bovino para carne
0141.2|Cría de ganado bovino para producción de leche cruda
0142.0|Cría de caballos y otros equinos
0144.0|Cría de ovejas y cabras
0145.0|Cría de cerdos
0146.2|Actividades de granja para la producción de huevos de gallina
0150.0|Cultivo de productos agrícolas en combinación con la cría de animales
0162.9|Otras actividades de apoyo a la ganadería
0163.1|Beneficio de café
0163.9|Otras actividades posteriores a la cosecha
0170.0|Caza ordinaria, mediante trampas y actividades de servicio conexas
0220.0|Extracción de madera
0321.0|Acuicultura marina
0510.0|Extracción de carbón de piedra
0620.0|Extracción de gas natural
0721.0|Extracción de minerales metalíferos no ferrosos
0810.0|Extracción de piedra, arena y arcilla
0891.0|Extracción de minerales para la fabricación de abonos y productos químicos
0893.0|Extracción de sal
1020.0|Elaboración y conservación de pescados, crustáceos y moluscos
1040.0|Elaboración de aceites y grasas de origen vegetal y animal
1061.1|Beneficio de arroz
1062.0|Elaboración de almidones y productos derivados del almidón
1104.0|Elaboración de bebidas no alcohólicas y aguas embotelladas
1200.0|Elaboración de productos de tabaco
1312.0|Tejedura de productos textiles
1391.0|Fabricación de tejidos de punto y ganchillo
1392.0|Fabricación de artículos confeccionados con materiales textiles
1393.0|Fabricación de tapices y alfombras
1511.0|Curtido y adobo de cueros; adobo y teñido de pieles
1512.0|Fabricación de maletas, bolsos de mano y artículos similares
1520.0|Fabricación de calzado
1610.0|Aserrado y acepilladura de madera
1621.0|Fabricación de hojas de madera para enchapado y tableros
1709.0|Fabricación de otros artículos del papel y cartón
1820.0|Reproducción de grabaciones
2012.0|Fabricación de abonos y compuestos de nitrógeno
2021.0|Fabricación de plaguicidas y otros productos químicos de uso agropecuario
2023.2|Fabricación de perfumes y preparados de tocador
2030.0|Fabricación de fibras artificiales
2100.0|Fabricación de productos farmacéuticos y sustancias químicas medicinales
2219.0|Fabricación de otros productos de caucho
2220.9|Fabricación de otros productos de plástico
2310.0|Fabricación de vidrio y productos de vidrio
2391.0|Fabricación de productos refractarios
2392.0|Fabricación de material de arcilla para la construcción
2393.0|Fabricación de otros productos de cerámica y porcelana
2395.0|Fabricación de artículos de hormigón, cemento y yeso
2396.0|Corte, tallado y acabado de la piedra
2399.0|Fabricación de otros productos minerales no metálicos n.c.p.
2410.0|Industrias básicas de hierro y acero
2420.0|Fabricación de productos primarios de metales preciosos y no ferrosos
2431.0|Fundición de hierro y acero
2432.0|Fundición de metales no ferrosos
2511.0|Fabricación de productos metálicos para uso estructural
2512.0|Fabricación de tanques, depósitos y recipientes de metal
2513.0|Fabricación de generadores de vapor
2520.0|Fabricación de armas y municiones
2630.0|Fabricación de equipos de comunicaciones
2651.0|Fabricación de equipos de medición y navegación
2652.0|Fabricación de relojes
2670.0|Fabricación de instrumentos ópticos y equipo fotográfico
2720.0|Fabricación de baterías y acumuladores
2732.0|Fabricación de otros hilos y cables eléctricos
2740.0|Fabricación de equipos de iluminación eléctricos
2750.0|Fabricación de aparatos de uso doméstico
2790.0|Fabricación de otro equipo eléctrico
2811.0|Fabricación de motores y turbinas
2813.0|Fabricación de otras bombas, compresores, grifos y válvulas
2815.0|Fabricación de hornos y quemadores
2821.0|Fabricación de maquinaria agropecuaria y forestal
2822.0|Fabricación de máquinas herramientas
2823.0|Fabricación de maquinaria para metalurgia
2824.0|Fabricación de maquinaria para minas y construcción
2825.0|Fabricación de maquinaria para alimentos, bebidas y tabaco
2826.0|Fabricación de maquinaria para productos textiles y cueros
2829.0|Fabricación de otros tipos de maquinaria de uso especial
2910.0|Fabricación de vehículos automotores
2930.0|Fabricación de partes y accesorios para motores de vehículos
3012.0|Construcción de embarcaciones de recreo y deporte
3020.0|Fabricación de locomotoras y material rodante
3030.0|Fabricación de aeronaves y naves espaciales
3091.0|Fabricación de motocicletas
3092.0|Fabricación de bicicletas y sillas de ruedas
3099.0|Fabricación de otros tipos de equipo de transporte n.c.p.
3100.1|Fabricación de muebles de madera
3211.0|Fabricación de joyas y artículos conexos
3212.0|Fabricación de bisutería y artículos conexos
3220.0|Fabricación de instrumentos musicales
3230.0|Fabricación de artículos de deporte
3240.0|Fabricación de juegos y juguetes
3311.0|Reparación de productos elaborados de metal
3314.0|Reparación de equipo eléctrico
3315.0|Reparación de equipo de transporte, excepto automotores
3510.0|Generación, transmisión y distribución de energía eléctrica
3520.0|Fabricación de gas y distribución de combustibles gaseosos
3700.0|Evacuación de aguas residuales
3811.0|Recolección de desechos no peligrosos
4100.0|Construcción de edificios
4210.0|Construcción de carreteras y vías férreas
4311.0|Demolición
4312.0|Preparación del terreno
4610.0|Venta al por mayor por comisión o contrato
4641.1|Venta al por mayor de productos textiles y prendas de vestir
4649.1|Venta al por mayor de aparatos y equipos domésticos
4651.0|Venta al por mayor de computadoras y programas informáticos
4652.0|Venta al por mayor de equipos electrónicos y telecomunicaciones
4662.0|Venta al por mayor de metales y minerales metalíferos
4669.1|Venta al por mayor de fertilizantes y agroquímicos
4711.1|Venta al por menor en supermercados, almacenes y similares
4719.1|Venta al por menor en tiendas por departamentos
4719.9|Venta al por menor en bazares y otros establecimientos no especializados
4723.0|Venta al por menor de tabaco en comercios especializados
4742.0|Venta al por menor de equipo de audio y video
4752.2|Venta al por menor de vidrio para construcción
4753.0|Venta al por menor de tapices y alfombras
4764.0|Venta al por menor de juegos y juguetes
4771.2|Venta al por menor de zapatos en comercios especializados
4911.0|Transporte de pasajeros por ferrocarril
4921.0|Transporte terrestre urbano y suburbano de pasajeros
4922.1|Transporte terrestre de estudiantes y empleados
4922.3|Transporte no regular de pasajeros en buses
4923.1|Transporte local e internacional de contenedores
5012.0|Transporte marítimo de carga
5120.0|Transporte de carga por vía aérea
5210.0|Almacenamiento y depósito
5221.1|Remolque y asistencia para vehículos de transporte terrestre
5221.9|Administración de carreteras, puentes y servicios auxiliares
5224.0|Manipulación de carga
5310.0|Servicios postales
5510.9|Otras actividades de alojamiento para estancias cortas
5590.0|Otras actividades de alojamiento
5621.0|Suministro de comidas por encargo
5630.0|Actividades de servicio de bebidas
5811.0|Edición de libros
5813.0|Edición de periódicos, diarios y revistas
5911.0|Producción de películas, videos y programas de televisión
5914.0|Proyección de películas
5920.0|Grabación y publicación de grabaciones sonoras
6120.0|Actividades de telecomunicaciones inalámbricas
6190.1|Servicios de café internet
6201.0|Actividades de programación informática
6202.0|Consultoría informática y gestión de instalaciones informáticas
6209.0|Otras actividades de tecnología de información y servicios informáticos
6391.0|Actividades de agencias de noticias
6411.0|Banca central
6420.0|Actividades de sociedades de cartera
6491.0|Arrendamiento financiero
6511.0|Seguros de vida
6512.0|Seguros generales
6611.0|Administración de mercados financieros
6619.0|Otras actividades auxiliares a las actividades de servicios financieros
6629.0|Otras actividades auxiliares de seguros y fondos de pensiones
6820.0|Actividades inmobiliarias realizadas a cambio de una retribución
7010.0|Actividades de oficinas principales
7020.0|Actividades de consultoría en gestión
7210.0|Investigación y desarrollo en ciencias naturales e ingeniería
7220.0|Investigación y desarrollo en ciencias sociales y humanidades
7710.1|Alquiler de automóviles sin conductor
7722.0|Alquiler de cintas de vídeo y discos
7830.0|Otras actividades de dotación de recursos humanos
7911.0|Actividades de agencias de viajes
8110.0|Actividades combinadas de apoyo a instalaciones
8121.0|Limpieza general de edificios
8129.0|Otras actividades de limpieza de edificios e instalaciones
8130.0|Paisajismo y servicios de mantenimiento conexos
8220.0|Actividades de centros de llamadas
8292.0|Actividades de envasado y empacado
8299.0|Otras actividades de apoyo a empresas n.c.p.
8421.0|Relaciones exteriores
8430.0|Actividades de planes de seguridad social de afiliación obligatoria
8522.0|Enseñanza de formación técnica y profesional
8530.2|Enseñanza parauniversitaria
8550.0|Actividades de apoyo a la enseñanza
8610.0|Actividades de hospitales
8620.2|Actividades de odontólogos
8690.1|Laboratorios médicos y de diagnóstico
8690.9|Otras actividades relacionadas con la salud humana
8720.0|Atención en instituciones para personas con enfermedades mentales
8810.0|Asistencia social sin alojamiento a adultos mayores y personas con discapacidad
8890.0|Otras actividades de asistencia social sin alojamiento
9101.0|Actividades de bibliotecas y archivos
9102.0|Actividades de museos y lugares históricos
9103.0|Actividades de jardines botánicos, zoológicos y parques naturales
9311.0|Gestión de instalaciones deportivas
9319.0|Otras actividades deportivas
9329.0|Otras actividades de esparcimiento y recreación n.c.p.
9411.0|Actividades de asociaciones empresariales y de empleadores
9412.0|Actividades de asociaciones profesionales
9420.0|Actividades de sindicatos
9491.0|Actividades de organizaciones religiosas
9492.0|Actividades de organizaciones políticas
9511.0|Reparación de computadoras y equipo periférico
9512.0|Reparación de equipos de comunicaciones
9521.0|Reparación de aparatos electrónicos de consumo
9522.0|Reparación de aparatos domésticos y de jardinería
9523.0|Reparación de calzado y artículos de cuero
9524.0|Reparación de muebles y accesorios domésticos
9529.0|Reparación de otros bienes personales y enseres domésticos
9601.0|Lavado y limpieza de productos textiles y piel
9602.0|Actividades de peluquería y otros tratamientos de belleza
9609.0|Otras actividades de servicios personales n.c.p.
9700.0|Actividades de hogares como empleadores de personal doméstico
9900.0|Actividades de organizaciones y órganos extraterritoriales
0130.0|Propagación de plantas
0149.0|Cría de otros animales
0311.0|Pesca marítima
1010.1|Elaboración y conservación de carne y embutidos
1071.9|Elaboración de otros productos de panadería
1101.0|Destilación, rectificación y mezcla de bebidas alcohólicas
1103.0|Elaboración de bebidas malteadas y de malta`;

export const HACIENDA_ACTIVITY_EXCERPT=Object.freeze(SAMPLE.split('\n').map(line=>{
 const split=line.indexOf('|');return Object.freeze({code:line.slice(0,split),description:line.slice(split+1)})
}));
export const normalizeActivityText=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').trim();
export function searchHaciendaActivityExcerpt(query,limit=8){
 const words=normalizeActivityText(query).split(/\s+/).filter(Boolean);
 if(!words.length)return [];
 const matching=HACIENDA_ACTIVITY_EXCERPT.filter(item=>{
  const text=normalizeActivityText(item.code+' '+item.description);
  return words.every(word=>text.includes(word));
 });
 return matching.sort((a,b)=>{
  const q=words.join(' '),aPrefix=a.code.startsWith(q)?0:1,bPrefix=b.code.startsWith(q)?0:1;
  return aPrefix-bPrefix||a.code.localeCompare(b.code);
 }).slice(0,Math.min(20,Math.max(1,limit)));
}
