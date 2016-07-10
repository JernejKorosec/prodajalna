//Priprava knjižnic
var formidable = require("formidable");
var util = require('util');
var sporocilce = "";
if (!process.env.PORT)
  process.env.PORT = 8080;

// Priprava povezave na podatkovno bazo
var sqlite3 = require('sqlite3').verbose();
var pb = new sqlite3.Database('chinook.sl3');

// Priprava strežnika
var express = require('express');
var expressSession = require('express-session');
var streznik = express();
streznik.set('view engine', 'ejs');
streznik.use(express.static('public'));
streznik.use(
  expressSession({
    secret: '1234567890QWERTY', // Skrivni ključ za podpisovanje piškotkov
    saveUninitialized: true,    // Novo sejo shranimo
    resave: false,              // Ne zahtevamo ponovnega shranjevanja
    cookie: {
      maxAge: 3600000           // Seja poteče po 60min neaktivnosti
    }
  })
);

var razmerje_usd_eur = 0.877039116;
var popust3Minute = 0;
function davcnaStopnja(izvajalec, zanr) {
  switch (izvajalec) {
    case "Queen": case "Led Zepplin": case "Kiss":
      return 0;
    case "Justin Bieber":
      return 22;
    default:
      break;
  }
  switch (zanr) {
    case "Metal": case "Heavy Metal": case "Easy Listening":
      return 0;
    default:
      return 9.5;
  }
}

// Prikaz seznama pesmi na strani
streznik.get('/', function(zahteva, odgovor) {
  if(zahteva.session.CustomerId == null) 
  {
        //console.log("Prva prijava, ni seje uporabnika!");
        odgovor.redirect('/prijava');
  }
  else
  {
    // ČE NI PRVA PRIJAVA IN SEJA UPORABNIKA OBSTAJA DO YOUR THING
    if(zahteva.session.CustomerId > 0)
    {
      //console.log("Uporabnik prijavljen ima sejo !");
             pb.all("SELECT Track.TrackId AS id, Track.Name AS pesem, \
                    Artist.Name AS izvajalec, Track.UnitPrice * " +
                    razmerje_usd_eur + " AS cena, \
                    COUNT(InvoiceLine.InvoiceId) AS steviloProdaj, \
                    Genre.Name AS zanr \
                    FROM Track, Album, Artist, InvoiceLine, Genre \
                    WHERE Track.AlbumId = Album.AlbumId AND \
                    Artist.ArtistId = Album.ArtistId AND \
                    InvoiceLine.TrackId = Track.TrackId AND \
                    Track.GenreId = Genre.GenreId \
                    GROUP BY Track.TrackId \
                    ORDER BY steviloProdaj DESC, pesem ASC \
                    LIMIT 100", function(napaka, vrstice) {
              if (napaka)
                odgovor.sendStatus(500);
              else {
                  for (var i=0; i<vrstice.length; i++)
                    vrstice[i].stopnja = davcnaStopnja(vrstice[i].izvajalec, vrstice[i].zanr);
                  odgovor.render('seznam', {seznamPesmi: vrstice});
                }
            })
            // END pb.all
      } 
      else
      {
        //console.log("Uporabnik se je odjavil!");
        odgovor.redirect('/prijava');
      }
  }
})

// Dodajanje oz. brisanje pesmi iz košarice
streznik.get('/kosarica/:idPesmi', function(zahteva, odgovor) {
  var idPesmi = parseInt(zahteva.params.idPesmi);
  if (!zahteva.session.kosarica)
    zahteva.session.kosarica = [];
  if (zahteva.session.kosarica.indexOf(idPesmi) > -1) {
    zahteva.session.kosarica.splice(zahteva.session.kosarica.indexOf(idPesmi), 1);
  } else {
    zahteva.session.kosarica.push(idPesmi);
  }
  
  odgovor.send(zahteva.session.kosarica);
});

// Vrni podrobnosti pesmi v košarici iz podatkovne baze
var pesmiIzKosarice = function(zahteva, callback) {
  if (!zahteva.session.kosarica || Object.keys(zahteva.session.kosarica).length == 0) {
    callback([]);
  } else {
    pb.all("SELECT Track.TrackId AS stevilkaArtikla, 1 AS kolicina, \
    Track.Name || ' (' || Artist.Name || ')' AS opisArtikla, \
    Track.UnitPrice * " + razmerje_usd_eur + " AS cena, 0 AS popust, \
    Genre.Name AS zanr \
    FROM Track, Album, Artist, Genre \
    WHERE Track.AlbumId = Album.AlbumId AND \
    Artist.ArtistId = Album.ArtistId AND \
    Track.GenreId = Genre.GenreId AND \
    Track.TrackId IN (" + zahteva.session.kosarica.join(",") + ")",
    function(napaka, vrstice) {
      if (napaka) {
        callback(false);
      } else {
        for (var i=0; i<vrstice.length; i++) {
          vrstice[i].stopnja = davcnaStopnja((vrstice[i].opisArtikla.split(' (')[1]).split(')')[0], vrstice[i].zanr);
        }
        callback(vrstice);
      }
    })
  }
}

streznik.get('/kosarica', function(zahteva, odgovor) {
  pesmiIzKosarice(zahteva, function(pesmi) {
    if (!pesmi)
      odgovor.sendStatus(500);
    else
      odgovor.send(pesmi);
  });
})

// Vrni podrobnosti pesmi na računu
var pesmiIzRacuna = function(racunId, callback) {
    pb.all("SELECT Track.TrackId AS stevilkaArtikla, 1 AS kolicina, \
    Track.Name || ' (' || Artist.Name || ')' AS opisArtikla, \
    Track.UnitPrice * " + razmerje_usd_eur + " AS cena, 0 AS popust, \
    Genre.Name AS zanr \
    FROM Track, Album, Artist, Genre \
    WHERE Track.AlbumId = Album.AlbumId AND \
    Artist.ArtistId = Album.ArtistId AND \
    Track.GenreId = Genre.GenreId AND \
    Track.TrackId IN (SELECT InvoiceLine.TrackId FROM InvoiceLine, Invoice \
    WHERE InvoiceLine.InvoiceId = Invoice.InvoiceId AND Invoice.InvoiceId = " + racunId + ")",
    function(napaka, vrstice) {
      //console.log(vrstice);   // TODO FIXME ZBRISI
      if(napaka) {
       callback(false);
      }
      else
      {
       for (var i=0; i<vrstice.length; i++) {
          vrstice[i].stopnja = davcnaStopnja((vrstice[i].opisArtikla.split(' (')[1]).split(')')[0], vrstice[i].zanr);
        }
        callback(vrstice);
      }
    })
}

// Vrni podrobnosti o stranki iz računa
var strankaIzRacuna = function(racunId, callback) {
    pb.all("SELECT Customer.* FROM Customer, Invoice \
            WHERE Customer.CustomerId = Invoice.CustomerId AND Invoice.InvoiceId = " + racunId,
    function(napaka, vrstice) {
      if(!napaka) callback(vrstice);
    })
}

// Vrni podrobnosti računa
var podrobnostiRacuna = function(invoideId, callback) {
  var sqlStatement = "SELECT invoice.* FROM Invoice WHERE Invoice.InvoiceId = " + invoideId;
  //console.log("sqlStatement:"+sqlStatement);
    pb.all(sqlStatement,function(napaka, vrstice) {
      if(!napaka) {
        //console.log("podrobnostiRacuna + !napaka");
        /*
        for(var name in vrstice[0]) {
            console.log('-'+name);
        }
        */
        callback(vrstice);
      }
      else
      {
        //console.log("podrobnostiRacuna + napaka"); 
      }
      
    })
}

function myFunction(item, index) {
    console.log( "index[" + index + "]: " + item); //"<br />");
}

// Izpis računa v HTML predstavitvi na podlagi podatkov iz baze
streznik.post('/izpisiRacunBaza', function(zahteva, odgovor) {
    var form = new formidable.IncomingForm();
    form.parse(zahteva, function (napaka1, polja, datoteke) {
    var napaka2 = false;
    try {
     var invoiceId = polja.seznamRacunov;
          podrobnostiRacuna(invoiceId, function(vrstice) {
              var racun_Id = vrstice[0].InvoiceId
              strankaIzRacuna(racun_Id, function(vrstice2) {
                 //pesmiIzKosarice(zahteva, function(pesmi//TODO FIXME ZBRIŠI ČE DELA SPODNJA VRSTICA
                 pesmiIzRacuna(racun_Id, function(pesmi) {
                                if (!pesmi) {
                                  odgovor.sendStatus(500);
                                } else if (pesmi.length == 0) {
                                  odgovor.send("<p>V košarici nimate nobene pesmi, \
                                    zato računa ni mogoče pripraviti!</p>");
                                } else {
                                          var racuni1 = vrstice[0];
                                          var kupci1 = vrstice2[0];
                                          /*
                                          var rokPlacilaDni = 6;
                                          var result2 = new Date(Date.parse(racuni1.InvoiceDate)).setDate(new Date(Date.parse(racuni1.InvoiceDate)).getDate() + rokPlacilaDni);
                                          var today1 = new Date(result2).toLocaleDateString('en-GB', {  
                                              day : 'numeric',
                                              month : 'numeric',
                                              year : 'numeric'
                                           }).split(' ').join('-'); //.toString().replace('/','.');
                                          var strDatumPlacila = today1;
                                          console.log(strDatumPlacila);
                                          */
                                          
                                          odgovor.setHeader('content-type', 'text/xml');
                                          odgovor.render('eslog', {
                                            vizualiziraj: true, 
                                            postavkeRacuna: pesmi,
                                            Racun: racuni1, 
                                            Stranka: kupci1,
                                            DodatniPopust: 0
                                            //,
                                            //DatumPlacila: strDatumPlacila
                                          });
                                          odgovor.end();
                                }
                 }); // pesmiizkosarice
              }); 
      });
    } catch (err) {
      napaka2 = true;
    }
  });
})

// Izpis računa v HTML predstavitvi ali izvorni XML obliki
streznik.get('/izpisiRacun/:oblika', function(zahteva, odgovor) {
  // TODO, renderiraj zadeve za customerja
  //  if(zahteva.session.CustomerId == null) 
  
  var customerId = zahteva.session.CustomerId;
  var popust1 = popust3Minute;
  console.log('streznik.get(/izpisiRacun/:oblika: ' + popust1);
  
  
  var kupci1 = [];
  if(customerId > 0) {
    vrniStranko(customerId,function(vrstice){
     kupci1 = vrstice[0];
     // ČE JE KUPEC IZBRAN ZANJ PRIPRAVI RAČUN
        var d = new Date();
        var curr_date = ('0' + d.getDate()).slice(-2);
        var curr_month = ('0' + (d.getMonth() + 1) ).slice(-2); //Months are zero based
        var curr_year = d.getFullYear();
        var str =  curr_year + "-" + curr_month + "-" + curr_date + 'T00:00:00.0Z'; 
        //console.log(str);
        var racuni1 = [];
        //2012-12-15T00:00:00.0Z
        racuni1.InvoiceDate = str;
            pesmiIzKosarice(zahteva, function(pesmi) {
              if (!pesmi) {
                odgovor.sendStatus(500);
              } else if (pesmi.length == 0) {
                odgovor.send("<p>V košarici nimate nobene pesmi, \
                  zato računa ni mogoče pripraviti!</p>");
              } else {
                console.log("rendering slog: " + popust1 + "% popusta");
                
                var whatToDo = false; //xml
                
                if(zahteva.params.oblika == 'html')
                {
                  odgovor.setHeader('content-type', 'text/xml');
                  whatToDo = true;//html
                }
                if(zahteva.params.oblika == 'xml')
                {
                  odgovor.setHeader('content-type', 'text/xml');
                  whatToDo = false;//xml
                }
                if(zahteva.params.oblika == 'download')
                {
                  odgovor.setHeader('Content-Type', 'application/octet-stream');
                  odgovor.setHeader('Content-Disposition', 'attachment; filename="racun.xml"');
                  whatToDo = false;//xml
                }
                odgovor.render('eslog', {
                  vizualiziraj: 
                  //zahteva.params.oblika == 'html' ? true : false,
                  whatToDo,
                  postavkeRacuna: pesmi,
                  Racun: racuni1, 
                  Stranka: kupci1,
                  DodatniPopust: popust1
                })  
              }
            })
     // END 
    })
  }
})

// Privzeto izpiši račun v HTML obliki
streznik.get('/izpisiRacun', function(zahteva, odgovor) {
  odgovor.redirect('/izpisiRacun/html')
})

// Vrni stranke iz podatkovne baze
var vrniStranke = function(callback) {
  pb.all("SELECT * FROM Customer",
    function(napaka, vrstice) {
      callback(napaka, vrstice);
    }
  );
}

// Vrni specifično stranko iz podatkovne baze
var vrniStranko = function(customerId,callback) {
  pb.all("SELECT Customer.* FROM Customer WHERE Customer.CustomerId= " + customerId + " ",
    function(napaka, vrstice) {
      if (napaka) {
        callback(false);
      } else {
        callback(vrstice);
      }
    }
  );
}

// Vrni račune iz podatkovne baze
var vrniRacune = function(callback) {
  pb.all("SELECT Customer.FirstName || ' ' || Customer.LastName || ' (' || Invoice.InvoiceId || ') - ' || date(Invoice.InvoiceDate) AS Naziv, \
          Invoice.InvoiceId \
          FROM Customer, Invoice \
          WHERE Customer.CustomerId = Invoice.CustomerId",
    function(napaka, vrstice) {
      callback(napaka, vrstice);
    }
  );
}

// Registracija novega uporabnika
streznik.post('/prijava', function(zahteva, odgovor) {
  var form = new formidable.IncomingForm();
  
  form.parse(zahteva, function (napaka1, polja, datoteke) {
    var napaka2 = false;
    try {
      var stmt = pb.prepare("" +
        "INSERT INTO Customer" +
    	  "(FirstName, LastName, Company, " +
    	  "Address, City, State, Country, PostalCode, " +
    	  "Phone, Fax, Email, SupportRepId) " +
        "VALUES (?,?,?,?,?,?,?,?,?,?,?,?)");
      
      if(polja.FirstName.length == 0 || polja.LastName.length == 0 || polja.Email.length == 0  )
        {
          sporocilce = "Manjkajoči obvezni podatki o stranki. Prosimo vnesite vse obvezne podatke stranke.";
          odgovor.redirect('/prijava');  
        }
        else{
          try {
          stmt.run(polja.FirstName, polja.LastName, polja.Company, polja.Address,
          polja.City, polja.State, polja.Country, polja.PostalCode, polja.Phone,
          polja.Fax, polja.Email,3,
            function(sqlErr) {
                if(sqlErr) {
                    sporocilce = "Prišlo je do napake pri registraciji nove stranke. Prosim preverite vnešene podatke in poskusite znova.";
                    odgovor.redirect('/prijava');
                } else {
                  sporocilce = "Stranka je bila uspešno registrirana.";
                }  
            }
          );
          stmt.finalize();
          odgovor.redirect('/prijava');
          } catch (err) {
            sporocilce = "Prišlo je do napake pri registraciji nove stranke. Prosim preverite vnešene podatke in poskusite znova.";
            napaka2 = true;
            console.log("Napaka: " + err);
          }
        }
    } catch (err) {
      napaka2 = true;
    }
  
    odgovor.end();
  });
})

// Prikaz strani za prijavo
streznik.get('/prijava', function(zahteva, odgovor) {
  vrniStranke(function(napaka1, stranke) {
      vrniRacune(function(napaka2, racuni) {
        odgovor.render('prijava', {sporocilo: sporocilce, seznamStrank: stranke, seznamRacunov: racuni});
      }) 
    });
})

// Prikaz nakupovalne košarice za stranko
streznik.post('/stranka', function(zahteva, odgovor) {
  popust3Minute = 20
// Koda resetira spremenljivkopopust na 0 vsake 3 minute ko kličemo /stranka
  setTimeout(function(){
    popust3Minute = 0;
    console.log('setTimeout popust: ' + popust3Minute);
  }, 3 * 60 * 1000); // 3 minute, 60 second, 1000 milisekund OZIROMA KAR 3 MINUTE
  
  setInterval(function(){
    console.log('setInterval popust: ' + popust3Minute);
    
  }, 3 * 1 * 1000); // 3 minute, 60 second, 1000 milisekund OZIROMA KAR 3 MINUTE

  var form = new formidable.IncomingForm();
  
  form.parse(zahteva, function (napaka1, polja, datoteke) {
      // <select size="10" id="seznamStrank" name="seznamStrank" class="form-control">
    var Customer_Id = polja['seznamStrank'];
    var Int_customer_id = parseInt(Customer_Id,10);
    // NA NOVO PRIJAVI IZPRAZNE KOŠARICO
    if( Int_customer_id > 0 )
    {
        zahteva.session.kosarica = [];
        zahteva.session.CustomerId = Int_customer_id;
        //console.log("zahteva.session.CustomerId:" + zahteva.session.CustomerId);
        odgovor.redirect('/');
    }
    else{
        odgovor.redirect('/prijava');
    }
    odgovor.end(); // mora očitno biti na koncu form.parse.
    
  });
})

// Odjava stranke
streznik.post('/odjava', function(zahteva, odgovor) {
    zahteva.session.CustomerId = [];
    zahteva.session.kosarica = [];
    odgovor.redirect('/prijava');
})



streznik.listen(process.env.PORT, function() {
  console.log("Strežnik pognan!");
})
